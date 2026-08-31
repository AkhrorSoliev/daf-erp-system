@AGENTS.md

# DaF Sprachzentrum — ERP System (Backend)

An ERP system for **DaF Sprachzentrum** language school. Backend API serving the frontend client.

> **Domain terms live in [`CONTEXT.md`](../CONTEXT.md)**, at the repo root: what
> a word MEANS, plus the file that defines it. This file is about HOW to work;
> `docs/adr/` is about WHY a decision was made. When a definition here and one
> there disagree, the code wins and both should be corrected.

> **Roles:** CEO, Branch Director, Administrator, Teacher, Cashier. The system supports **multiple branches** (filials).
> Roles are stored in a `Role` table with fixed IDs (1–6: CEO=1, Branch Director=2, Administrator=3, Teacher=4, Cashier=5, **Student=6**), linked to users via `UserRole` join table (many-to-many). The Student role id is exposed as `STUDENT_ROLE_ID` constant in `src/students/shared/student-select.ts`.

## Arxitektura qarorlari (ADR)

**`docs/adr/` — qaytarish qiyin bo'lgan qarorlar jurnali.** Kodni o'zgartirishdan
oldin [docs/adr/README.md](../docs/adr/README.md) indeksini ko'ring: agar tegayotgan
joyingiz ADR bilan qoplangan bo'lsa, o'sha ADR **majburiy qoida** — kod unga
moslashadi, teskarisi emas.

Hozirgi ADR'lar quyidagilarni qamraydi: filial ajratilishi (0001), fail-closed
filial qamrovi (0002), route siyosati manifesti (0003), ledger'ga langarlangan
balans (0004), hisobot pastki chegarasi (0005), oylikning yagona manbasi (0006),
lavozim va rol farqi (0007), ro'yxatdan o'tish aktori (0008).

**Yangi ADR qachon yoziladi:** ma'lumot modeli, pul semantikasi, filial qoidasi,
fail-open/fail-closed tanlovi yoki tashqi xizmat tanlovi o'zgarsa — ADR **o'sha
ishning o'zi bilan bitta PR ichida** yoziladi. Qabul qilingan ADR hech qachon
tahrirlanmaydi; eskirsa yangi ADR yoziladi va eskisining holati
`Almashtirildi` ga o'tadi. Batafsil: [docs/adr/README.md](../docs/adr/README.md).

## Tech Stack

- **NestJS** (TypeScript) — API framework
- **Prisma ORM** — Database access (PostgreSQL)
- **PostgreSQL** — Primary database
- **Redis** — Caching
- **Docker** — Containerization (PostgreSQL + Redis)
- **JWT + Passport** — Authentication
- **bcryptjs** — Password hashing
- **class-validator + class-transformer** — DTO validation

## Architecture Rules

### Module Structure

- Every domain entity gets its own NestJS module (module + controller + service + dto/)
- Services contain business logic; controllers are thin (validation + delegation)
- Use `PrismaService` for all database access. Prefer the Prisma query builder; raw SQL is allowed **only** via the tagged-template `$queryRaw`/`$executeRaw` (parameterized — values become `$1,$2…`). **Never** use `$queryRawUnsafe`/`$executeRawUnsafe` (string-built — SQL-injection risk). Tagged-template raw SQL is used in some production services (e.g. `billing/lesson-billing.service.ts` for a `NOT EXISTS` unpaid-lesson scan) as well as one-off backfill scripts in `server/scripts/`. As of 2026-08 `src/` contains **zero** `*Unsafe` calls; the 7 that exist are all in `server/scripts/`, where the interpolated values are table names from a hardcoded list and never user input. That is the only place the exception has ever applied — a new one in `src/` is a bug, not a precedent.
- `PrismaModule` is global — no need to import it per module

### Naming Conventions

- **Files:** kebab-case — `create-student.dto.ts`, `jwt-auth.guard.ts`
- **Classes:** PascalCase — `CreateStudentDto`, `JwtAuthGuard`
- **Database fields:** camelCase in Prisma schema
- **API endpoints:** kebab-case plural nouns — `/api/branches`, `/api/students`
- **API prefix:** All routes are prefixed with `/api`

### DTOs and Validation

- Every endpoint must have a DTO with `class-validator` decorators
- Global `ValidationPipe` is configured with `whitelist: true` and `forbidNonWhitelisted: true`
- Phone numbers: stored as **9-digit strings** (without `+998` prefix)
- Prices: stored as **integers** (in so'm)
- **User and Student IDs:** Always **5-digit integers** (starting from 10000). PostgreSQL sequence is set to start at 10000. Never manually assign IDs below 10000.

### Authentication & Authorization

- All routes require JWT auth by default (global `JwtAuthGuard`)
- Public routes use `@Public()` decorator to bypass auth
- Role-based access uses `@Roles('CEO', 'Administrator')` decorator with `RolesGuard` (string-based role names)
- JWT uses **access token (1h)** + **refresh token (24h)** pair
- `POST /api/auth/login` returns both tokens + user data
- `POST /api/auth/refresh` refreshes the token pair
- Use `@CurrentUser()` decorator to get the authenticated user in controllers

#### Phone-based login (all roles)

- **Every role logs in with their phone number** (the `login` field on the DTO now carries a phone in any format the user typed; the legacy username is still accepted as a fallback so no account is locked out). `AuthService.validateUser(login, password, allowedRoleIds?)` normalizes the raw input via `normalizeSharedPhone` (`src/common/utils/phone.util.ts`) — the single shared rule also used by the Telegram registration scenes: Uzbek numbers collapse to 9 digits, foreign numbers keep their country code. It then builds a deduplicated `OR` list (up to five clauses: the raw identifier as `login`, the normalized/raw digits as `phone`, and as `login`) + `deletedAt: null` + status ACTIVE/INACTIVE.
- **Neither `User.login` nor `User.phone` is `@unique`** — a phone can map to several accounts. The lookup is therefore **portal-scoped**: `LocalStrategy` (`passReqToCallback: true`) reads the `Origin` / `X-Portal` header, resolves the portal's allowed role IDs via `resolveAllowedRoleIds`, and passes them to `validateUser`, which filters `roles.some.role.id ∈ allowedRoleIds`. If several accounts still match within one portal, the **most recently updated** wins (`orderBy updatedAt desc`). Consequence: a wrong-portal login now returns 401 (`validateUser` finds nothing) rather than the old 403 from `login()`'s role gate — that gate stays as defense-in-depth.
- **SMS password reset works for every role** (not just students): `PortalPasswordResetService.resolveByPhone(phone, allowedRoleIds?)` matches `OR: [{ login }, { phone }]` scoped to the portal roles (from `Origin`/`X-Portal`), same tiebreak. See the Eskiz OTP flow under "SMS forgot password".
- **Operational caveat:** because phone isn't unique, assigning the same phone to multiple staff within one portal makes only the most-recent one reachable by phone. Audit before relying on phone-login: `scripts/audit-login-phone.ts` (read-only — flags missing phones + duplicate groups); `scripts/sim-phone-login.ts` simulates which account a phone resolves to per portal.

#### Telegram OAuth sign-in (web portals)

- **Web only.** All three portals (`admin` / `lehrer` / `student`) offer "Telegram orqali kirish" through Telegram's official OAuth 2.0 / OIDC flow. The student **native app** still uses the older bot-deep-link + `GET /auth/otp/poll` flow — that flow's `requestId` is minted by the client and approved by whoever presses START, so a forwarded `t.me` link can hand the victim's session to an attacker. OAuth closes that by construction; do not extend the poll flow to staff.
- **Endpoints** (all `@Public()`, all `IpThrottlerGuard`): `GET /auth/telegram/status` → `{ enabled }`, `GET /auth/telegram/start` → `{ url }`, `GET /auth/telegram/callback` (Telegram redirects here, 302s to the portal), `POST /auth/telegram/complete` → session.
- **The portal origin comes from the `Origin` header ONLY.** `start` takes **no query parameters** — an earlier `?origin=` override was the one way a production request could claim `http://localhost:3000` and bypass portal scoping, and the client never sent it. Do not re-add it. `isKnownPortalOrigin` also requires the `https:` scheme (localhost/127.0.0.1 exempt for dev) and rejects a URL carrying `username`/`password`, because that origin is where the single-use `handoff` is delivered.
- **`state` + PKCE live in Redis** (`tg_oauth:state:*`, 5 min, single-use via `getdel`) together with the portal origin. The `code_verifier` **never reaches the browser**, so a leaked authorize URL cannot be redeemed elsewhere; `state` + PKCE are what prevent code injection and code replay. **Nothing is stored in the browser** — no cookie, no verifier — so do not describe this pair as "binding the flow to the initiating browser". What actually closes the old bot-link relay hole is the delivery path: **Telegram hands the `code` to our server through the authorizing browser, and the `handoff` goes back out in that same browser's 302**, so the session lands in the browser that did the authorizing. The one residual this does _not_ cover: an attacker who authorizes with their own Telegram account can hand the victim their own `?handoff=` URL within the 60s window and the page will overwrite the victim's session with the attacker's. That is bounded (single-use, 60s), conspicuous (the victim is suddenly someone else), gives the attacker nothing they did not already have, and is not the hole this design targets — the old flow's defect was the reverse direction (the _victim's_ session opening in the _attacker's_ browser).
- **One `redirect_uri`, on the API domain** (`https://api.dafzentrum.uz/api/auth/telegram/callback`), because the code is exchanged with the client secret server-side. The portal to return to comes from the stored `state` and is re-checked against `isKnownPortalOrigin` — without that whitelist the callback would be an open redirect.
- **`id_token` verification is absolute**: RS256 against `https://oauth.telegram.org/.well-known/jwks.json`, `issuer=https://oauth.telegram.org`, `audience` = client id, `exp`, plus `phone_number_verified === true`. Any failure denies sign-in. Never add a soft path and never read the token without verifying it — the whole flow's trust rests on this signature.
- **Account lookup is shared with password login**: `phone_number` (no `+`, country code included) → `AuthService.findAccountsByIdentifier` (the `findMany`/`take: 2` twin of `findAccountByIdentifier`, sharing one private `buildAccountLookup` where-clause) → `AuthService.login` applies the portal role gate. The Telegram path must never be wider than the password path; that is why the where-clause is one function.
- **A shared phone FAILS CLOSED on the OAuth path.** Neither `User.login` nor `User.phone` is unique, so one phone can match several accounts within the same portal (an office number on both a Cashier and an Administrator). Password login's `orderBy updatedAt desc` tiebreak is harmless — reaching the winning account still needs _that_ account's password — but OAuth removes that second factor, so picking a winner would sign the caller into a stranger's account. When `findAccountsByIdentifier` returns more than one row the OAuth path refuses with "Bu raqam bir nechta akkauntga tegishli. Iltimos, telefon raqam va parol bilan kiring." **`validateUser` is deliberately unchanged** — do not "make them consistent" by adding the refusal to password login, and do not drop it from the OAuth path.
- **Tokens never travel in a URL.** The callback redirects with a single-use `handoff` (`tg_oauth:handoff:*`, 60s) that the SPA exchanges. A URL would leak the session into browser history, referrers and proxy logs.
- **Failures after the `state` is consumed 302 to the portal, they do not throw.** `handleCallback` wraps everything past `consumeState` and returns `${portalOrigin}/auth/telegram/callback?error=<urlencoded message>`; the client page reads `error` and renders it with a "back to sign-in" button. Throwing there stranded the user on raw JSON at `api.dafzentrum.uz` with no way back. Only the message goes in the query string — nothing sensitive, and an unexpected (non-`HttpException`) error is replaced by a generic string and logged instead. The two failures that happen _before_ the origin is known stay JSON 400: a stale/replayed/unknown `state`, and the user-declined `error` branch. Relatedly, `!code` is checked **before** `consumeState` so a code-less redirect does not burn a single-use state.
- **`User.telegramChatId` is NOT written.** The `sub` claim is an opaque per-bot identifier, not the bot's `chat.id`; the Telegram user id is the separate `id` claim. Writing the wrong value would break bot messaging, and nothing here needs it. The verifier still asserts the `id` claim is **present and scalar** (a real strictness guard on the token shape) but deliberately does **not return the value** — no consumer wants it, and a large id parsed as a JSON `number` can exceed 2^53 and silently lose precision.
- **Config gate:** missing any of the three env vars turns the feature fully off — `status` returns `{ enabled: false }` and the client renders no button; `start` answers **503** (`ServiceUnavailableException`). `status` also reports `false` when the calling `Origin` is not a known portal, so a CORS-allowed non-portal origin (e.g. a Vercel preview alias) shows **no** button instead of one that 400s on click. Config is applied by hand in BotFather + Railway, so a half-configured deploy must degrade to "off", never to a broken button.

### Portal-Based Role Restriction (Subdomain Routing)

The system uses **subdomain-based portals** — each subdomain restricts login to specific roles:

| Portal         | Domain                  | Allowed Roles                                                                                                                               |
| -------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Admin panel    | `admin.dafzentrum.uz`   | CEO (1), Branch Director (2), Administrator (3), Cashier (5)                                                                                |
| Teacher portal | `lehrer.dafzentrum.uz`  | Teacher (4)                                                                                                                                 |
| Student portal | `student.dafzentrum.uz` | Student (6) — implemented via `student-portal.controller.ts` (profile, schedule, attendance stats/history/scan, payments via Payme + Click) |

- Configuration: `src/auth/portal-roles.config.ts` — `PORTAL_ROLES` mapping
- **How it works:** On login, `AuthService.login()` reads the `Origin` header, calls `getAllowedRoleIds(origin)` to get allowed role IDs for that portal, and throws `ForbiddenException` if the user has no matching role
- **Localhost/dev:** Returns `null` (no restriction) — all roles can log in from localhost
- **Error message:** "Sizning rolingiz bu portalga kirish huquqiga ega emas" (Uzbek)
- When adding a new portal subdomain: update `PORTAL_ROLES` in config, add CORS origin in `main.ts`, add DNS record in Cloudflare, configure in Vercel

### Role-Based Access Control (RBAC) — Backend Rules

> See full permission matrix: `docs/role-access.md`

**CRITICAL: The backend is the real security boundary.** Frontend UI restrictions (hidden pages, disabled buttons) can be bypassed by calling the API directly. Every feature that is restricted to specific roles **must** have a `@Roles()` guard on its backend endpoint — this is non-negotiable.

**When restricting access for any role:**

1. **Backend:** Add `@Roles()` + `@UseGuards(RolesGuard)` on the controller endpoint so the API returns `403 Forbidden` for unauthorized roles
2. **Frontend:** Hide the corresponding page/route, sidebar link, button, tab, or UI element entirely
3. **Both layers must always be in sync** — if a page is hidden on the frontend, the backend endpoint must also reject the request, and vice versa

This applies to **all roles** — not just teachers. Whenever a role should not access a feature, protect it on both sides.

#### Role hierarchy

1. **CEO** — full access to everything across all branches
2. **Branch Director** — full access but **only within their own branch**
3. **Administrator** — operational access (CRUD for groups, teachers, students, etc.)
4. **Teacher** and **Cashier** — limited access (details TBD)

#### Position vs role — a job title grants nothing

`User.position` names what an employee does; `UserRole` decides what they may
do. A cleaner or a guard has a position and **no role at all**, which is the
only way to put them on payroll without handing them a permission to describe
their job. Do not add permission-less rows to the `Role` table to solve this:
role ids and names are read by `@Roles()` guards, `portal-roles.config.ts`,
`GRANTABLE_ROLE_IDS` and payroll filters, and any one of them forgetting to
exclude the new row would silently grant access.

- `position` is **required on create** for every employee (`CreateUserDto`),
  nullable in the schema so pre-existing rows keep working. There is no
  backfill script — the employee form pre-fills the field from the role label,
  so a title is written the first time anyone is edited. Both
  `teacher-registration.scene.ts` and `employee-registration.scene.ts` also
  call `UsersService.create`, so this requirement broke bot onboarding until
  it was fixed: teacher registration always grants exactly the Teacher role
  and sends `"O'qituvchi"` directly, while employee registration can grant
  several roles and derives the position from them via
  `derivePositionForRoles(roleIds)` (`telegram/constants.ts`'s
  `POSITION_LABELS`, lowest role id wins — one mapping, not a copy per scene).
  Any future caller of `UsersService.create` must supply a position; reach for
  that helper rather than writing a second role→position map.
- `roleIds` is **optional**. `assertRoleAndBranchRules` no longer returns early
  on an empty role list — that early return meant the one employee who most
  needs a branch (one who exists only to be paid) was the one never checked.
- **A role-less employee is refused a login or password.** An explicit
  credential write — `login` or `password` present in the DTO — landing on an
  account whose resulting role set is empty is rejected (400) on both create
  and update. Two independent things then keep such an account out:
  `validateUser` returns null for an account with no password (this holds on
  localhost, where the portal role filter applies nothing), and the portal
  lookup requires `roles.some.role.id ∈ allowedRoleIds`, which an empty role
  list never satisfies. Do not relax the password refusal — it is half of
  that pair.
- **Demoting someone to role-less still works, because the service clears
  credentials itself.** The DTO has no field that means "clear the login" —
  only "set a new one" — so the refusal above cannot be the whole story, or
  "turn an administrator into a role-less cleaner" would be impossible through
  the UI. `UsersService.update` handles the other half: when the RESULTING
  role set is empty, it nulls the stored `login` and `password` regardless of
  what the DTO contains. This is not optional cleanup — it is the invariant
  that makes the create-time refusal compatible with the demotion flow.
- `SalaryStaffConfigService.listStaff` already covered role-less employees
  (an empty role array satisfies its none-of-`['Teacher','Student']` filter);
  it now returns `position` so the rate list has something to call them.
  `SalaryConfigRowSheet` sees no role 4 and offers FIXED_MONTHLY alone.

There is deliberately **no `Position` table** yet. Promote this string to one
when any of these becomes true: reports need to filter or group by position;
more than one person adds employees (typo risk multiplies); or a title must be
renamed in one place and change everywhere.

#### Backend role-check pattern

Use `@Roles()` decorator with **string role names** + `RolesGuard`:

```typescript
@UseGuards(RolesGuard)
@Roles('CEO', 'Branch Director', 'Administrator')
```

#### Key access rules

- **Salary/financial endpoints** — restrict to `@Roles('CEO', 'Branch Director')` only. **Exception, decided 2026-08-12:** the four READ endpoints behind `/payments/debt` (`GET /reports/monthly-debt-recovery/history` · `/:monthKey/aging` · `/:monthKey/detail` · `/excel`, plus `GET /reports/debt-write-offs-summary` and `GET /transactions/debt-write-offs`) are open to every staff role, because that page must not change shape by viewer — a screen whose tabs appear or vanish per role is one nobody can be told how to use. The WRITE that moves money back, `POST /billing/debt-write-offs/:id/reverse`, stays CEO-only. `GET /reports/monthly-debt-recovery` (the cohort report behind the Excel workbook, not a page) was deliberately NOT widened
- **Group CRUD** — `@Roles('CEO', 'Branch Director', 'Administrator')`
- **Settings/configuration endpoints** — restrict to `@Roles('CEO', 'Branch Director', 'Administrator')` — roles like Teacher and Cashier must not access these
- **Branch Director scope** — when a Branch Director makes a request, service-level logic must filter data to **only their branch** (using `@CurrentUser('branches')` or `@CurrentUser('mainBranch')`)
- When adding a new role-restricted feature: always add the restriction in both the controller (backend) and the component (frontend). **Never** add a frontend-only restriction without a corresponding backend `@Roles()` guard

### Pagination

- Default page size: **10**
- All list endpoints support `?page=1&pageSize=10` query params
- Return format: `{ data: T[], total: number, page: number, pageSize: number }`
- Use `PaginationDto` from `src/common/dto/pagination.dto.ts`

### API Response Convention for Mutations

- **All CREATE/UPDATE endpoints must return the full updated entity** in the response body — the frontend uses this for optimistic UI updates and does not refetch after mutations
- **DELETE endpoints** return `{ message: string }` — the frontend uses the ID from the request to remove the entity from local state
- Exception: **financial data** (balances, payments, salaries) — frontend always refetches these from the server to ensure accuracy

### Soft Delete & Archive

- **DELETE = archive, not destroy.** All DELETE endpoints set `deletedAt` timestamp instead of removing the row. No data is permanently lost.
- `isActive: false` means **deactivated** (visible in system). `deletedAt IS NOT NULL` means **archived** (invisible to non-CEO roles).
- Archivable models have 3 fields: `deletedAt DateTime?`, `deletedById Int?`, `deletionBatchId String?`
- **All queries must include `deletedAt: null`** in their `where` clause to exclude archived records
- Unique constraints use **partial indexes** (`WHERE "deletedAt" IS NULL`) so archived records don't block new ones
- **Cascade archiving:** When a parent is archived, children are archived too with the same `deletionBatchId` (UUID). Restore reverses the entire batch.
- Archive endpoints (`/api/archive/*`) are **CEO-only**: list, detail, restore, permanent delete
- **Permanent delete** (`DELETE /api/archive/:entityType/:id`) removes the record from DB and deletes associated files from Cloudflare R2
- Files (photos, avatars) are **NOT deleted** during soft delete — only during permanent delete from archive

### Entity History (Audit Log)

- A **universal `EntityHistory` table** tracks all changes (CREATE, UPDATE, DELETE, STATUS_CHANGE, RESTORE) for every entity (Student, Branch, Room, Course, Group, User, Lead, Holiday, Enrollment)
- Every service that performs a mutation **must** record the change via `EntityHistoryService` — this is **not optional**
- **Cross-entity history is mandatory** — when a mutation on entity A cascades to entity B, history must be recorded on **both** entities. Examples:
  - Student status change (FROZEN/EXPELLED/ARCHIVED) cascades to enrollments → record in **Group** history (e.g. `OQUVCHI_MUZLATILDI`, `OQUVCHI_CHETLATILDI`)
  - Group COMPLETED auto-graduates students → record in **Student** history
  - Any operation affecting group composition (student add/remove/freeze/unfreeze) must appear in that group's history
  - Any operation affecting a student's enrollment or status must appear in that student's history
- **Cascade services must record history** — `StatusCascadeService` injects `EntityHistoryService` and records cross-entity history for all cascade operations. When adding new cascade logic, always include corresponding history records
- The service is global (`EntityHistoryModule` in `src/common/entity-history/`) and injectable in any service without importing the module
- Methods: `recordCreate()`, `recordUpdate()`, `recordDelete()`, `recordStatusChange()`, `recordRestore()`
- For **UPDATE**, pass the full old and new objects — the service auto-computes the diff via `computeChangedFields()` in `diff.util.ts` and only stores changed fields. If nothing actually changed, no history record is created
- Sensitive fields (`password`) and metadata fields (`updatedAt`, `createdAt`, `deletedAt`, `deletedById`, `deletionBatchId`, `statusChangedAt`, `statusChangedById`, `statusChangeReason`) are automatically excluded from history — see `EXCLUDED_KEYS` in `diff.util.ts`
- Only **plain values** (strings, numbers, booleans, dates, null) are stored — nested objects and arrays are skipped
- `StatusHistory` table still exists alongside `EntityHistory` — it handles status transition **validation** (`isValidTransition`). Both tables record status changes, each serving its own purpose
- Query endpoint: `GET /api/entity-history/:entityType/:entityId?page=1&pageSize=20` — returns paginated history with `changedBy: { id, name }` user info, ordered by `createdAt DESC`
- Access: restricted to CEO, Branch Director, Administrator
- **History tabs in the frontend rely on this endpoint** — if a new entity type is added, ensure its CRUD methods call `EntityHistoryService` so the frontend history tab has data to display

#### Controller → Service userId pattern

- **All controllers that perform create/update must pass `@CurrentUser('id') userId` to the service method** — this is required for the audit trail (`changedById` field in `EntityHistory`)
- Pattern: `create(@Body() dto, @CurrentUser('id') userId: number)` → `this.service.create(dto, userId)`
- Service methods accept `userId?: number` as an optional parameter and pass it to `EntityHistoryService`
- This applies to: `BranchesController`, `CoursesController`, `GroupsController`, `RoomsController`, `StudentsController`

#### Archive + EntityHistory integration

- **Soft delete (archive):** `ArchiveService` calls `entityHistoryService.recordDelete()` when permanently deleting entities — records the entity state before deletion
- **Restore:** `ArchiveService` calls `entityHistoryService.recordRestore()` when restoring archived entities — records the restored status
- Both operations log the `changedById` (user who performed the action) and `companyId` for multi-tenant filtering

#### Currently tracked entities

| Entity  | create | update       | statusChange | delete | restore |
| ------- | ------ | ------------ | ------------ | ------ | ------- |
| Student | ✅     | ✅           | ✅           | ✅     | ✅      |
| Group   | ✅     | ✅           | ✅           | ✅     | ✅      |
| Branch  | ✅     | ✅           | ✅           | ✅     | ✅      |
| Room    | ✅     | ✅           | ✅           | ✅     | ✅      |
| Course  | ✅     | ✅           | ✅           | ✅     | ✅      |
| User    | ✅     | ✅ (profile) | —            | —      | —       |
| Holiday | ✅     | ✅           | ✅           | ✅     | —       |

### Holidays (Multi-day + Group endDate cascade)

- `Holiday` schema carries `date` + `endDate` (both NOT NULL). Single-day holidays store `endDate = date`. Frontend sends `"YYYY-MM-DD"` strings; the service coerces missing `endDate` to `date`. Hard cap: 60 days per holiday.
- **All callers must use `HolidaysService` helpers** instead of `prisma.holiday.*` directly:
  - `findActiveHolidayCovering(date)` — range-overlap check (`date <= X AND endDate >= X`). Replaces exact-date `findFirst` lookups.
  - `buildHolidayDateSet(start, end)` — Tashkent calendar dates covered by any active holiday in the range. Pads ±1 day for UTC/Tashkent midnight skew.
  - `getActiveHolidaysInRange(start, end)` — raw row list with overlap.
- **`GroupHolidayExtension` cascade**: when a holiday is created and overlaps an ACTIVE/FORMING group's `[startDate, endDate]`, `GroupHolidayCascadeService.extendGroupEndDateForHoliday(groupId, holidayId)` advances `Group.endDate` by the number of scheduled-day lessons (`exactDays`) the holiday "eats" inside the group's lifecycle. The new tail walks forward day-by-day, skipping `exactDays` matches that are themselves on other active holidays. Each extension is recorded in `GroupHolidayExtension { oldEndDate, newEndDate, daysExtended }` so deletion / `ACTIVE → CANCELLED` can reverse it. Unique `(groupId, holidayId)` guarantees idempotency.
- **Overlap rule**: when multiple holidays overlap on the same scheduled day, only the holiday with the **earlier `date`** claims it — prevents double-counting.
- **Reversal safety**: if `Group.endDate` was manually edited between extension and reversal, the cascade logs a warning and drops the extension row without clobbering the manual change.
- **`HolidaysService.update` cannot change `date` / `endDate`** once any extension exists for that holiday — admins must delete and recreate. Name edits are always allowed. Comparison is done with `tashkentDateStr` so the frontend's `"YYYY-MM-DD"` form payload matches the DB Date.
- **Dashboard short-circuit**: `getTodaySchedule` returns empty `lessons` (like Sunday) when the target date is covered by a holiday — the orange banner from `isHoliday` + `holidayName` is the only signal the UI shows.
- **Telegram stats crons skip Sundays and holidays**: `TelegramGroupDailyCronService` (21:00 daily report) and `TelegramGroupDigestCronService` (every 3h digest of buffered events) first call `isTashkentSunday()` (in `telegram-groups/utils/format.util.ts`) and short-circuit on the weekly day off, then call `findActiveHolidayCovering(new Date())` and return early on bayram days. Event-driven Telegram messages (attendance, debt, lesson cancellation, payment, task) are NOT gated — they fire whenever the underlying user action happens. The attendance-reminder cron has had its own holiday short-circuit since the original implementation.
- **Daily report composition (`TelegramGroupDailyReportService.build`)**: the 21:00 message body is built here (the `TelegramGroupStatsService.buildDailyReport` used by `/hisobot` is now a thin delegator returning only `.message`). One glance with a 🚦 traffic-light header (🟢/🟡/🔴 via `resolveTrafficLight`) then sections: 💰 today's cash-in (by method) / operational spend (Expense minus `TEACHER_ADVANCE`, `date` is a DATE column so match `tashkentTodayDate()`) / net; 👥 new − departed students (`Enrollment` DROPPED distinct `studentId` today; TRANSFERRED excluded) + new leads (`Lead` is single-tenant, global count) with today's conversions; 🎓 lessons + attendance (LATE/EXCUSED broken out, % = attended/(attended+absent)); 📌 active students + debt with a day-over-day ▲/▼ delta; 📅 MTD income/expense/**Avans**/net + the collection ratio + `Oy oxiriga kutilyapti` (`ReportsService.getMonthlyExpectation` — see "One month-end expectation" below; NEVER re-derive it here, the line it replaced was a local `exactDays × 4` walk) — **`Xarajat` (operational, advance-free) and `Avans` (`TEACHER_ADVANCE`) are separate lines, and `Sof foyda = Tushum − Xarajat − Avans`** (advances are teacher pay, netted out but shown apart); the two MTD `Expense.aggregate` queries bound `date` with a **date-only** Tashkent month window `[firstOfThisMonthDate() … tashkentTodayDate()]` — **NOT** `firstOfThisMonthUtc()`, which is a -5h-shifted timestamp that Postgres floors to the previous month's 30th/31st against a DATE column and leaks that day's rows (e.g. June-30 rent/salary) into the total; the income query keeps `firstOfThisMonthUtc()` because it filters `Payment.createdAt` (a real timestamp). This makes the telegram `Xarajat` reconcile exactly with the `/payments/expenses` page (same advance-free month window). The `Avans` line self-suppresses when the MTD advance total is 0. 💵 `Ustozlar oyligi` — `SalaryMonthlyService.getMonthly({}, companyId, ceoId).totals` deserved/covered/**centerFunded** (the center top-up — written accruals plus the not-yet-settled forecast, so it does NOT drop to 0 once the month is settled, hidden when a CEO/Admin caller is missing or the month is all-null); 🚩 self-suppressing `Diqqat` flags (today's REFUND / DEBT_WRITE_OFF / large ADJUSTMENT from the ledger + low-attendance) collapsing to "✅ Bugun jiddiy muammo yo'q" on a clean day. The expectation, the collection ratio and salary are each `try/catch`-wrapped so one failing just drops its own line. Company name is `escapeHtml`-escaped. The cron builds once per company (reused across its groups) and, only after a confirmed send, calls `persistSnapshot` → **`DailyFinancialSnapshot`** (one row per company per Tashkent day, upsert) which powers tomorrow's debt ▲/▼ delta; `/hisobot` on-demand never writes a snapshot.
- **Interactive report menu (`TelegramGroupReportMenuService`)**: the daily report (and `/hisobot`) carry a `« Ko'proq imkoniyatlar »` inline button (`reply_markup`, `TelegramGroupReportMenuService.moreButton()`). `TelegramAdminBotRegistrar.registerReportMenu` wires `bot.action(/^rm:.../)` handlers (the admin bot previously had NO callback_query handling). The menu is **stateless** — all flow state rides in `callback_data` (`rm:open|root|close`, `rm:full→rm:fy:YYYY→rm:fm:YYYY-MM`, `rm:cmp→rm:ca:YYYY-MM→rm:cb:A:B`, `rm:pre→rm:p3|p6|p12|py:YYYY`, `rm:cfin`) because the admin bot has no session and a group session key would collide across members. Navigation edits the same menu message; each generating leaf sends the Excel as a NEW document. It calls `ReportsExcelService.generate()` (already returns a Buffer; **now exported from `ReportsModule`** along with `ReportsFinancialService`; `TelegramGroupsModule` imports `ReportsModule`) with a month/period/preset range: single month = `compareModes:[]`; comparison = later month as period + `compareModes:['custom']` + earlier month as `compareStartDate/End`; yearly = `['yearly']`. `performedById` = the company CEO id (salary-sheet scope). Month/year lists run from `Company.systemStartDate`'s floor month (2026-05 here, NOT March). `rm:cfin` posts an in-chat `getFinancialOverview` text card (no file). **Trust model: READ-ONLY at group level** — the workbook goes to the same group already getting daily financials; a group callback has NO per-user ERP identity, so NO mutation is ever reachable from a group button (any future actions must move to an identity-linked DM). **Webhook caveat**: the admin bot has no `handleUpdate` route, so callback_query only works in polling mode (`TELEGRAM_ADMIN_BOT_WEBHOOK_URL` unset) — verify before relying on buttons. **Double-tap guard**: `generateAndSend` adds the chat id to an in-flight `Set` SYNCHRONOUSLY before its first await, so a rapid second tap can't produce a second workbook (it toasts "kuting…"); on start it edits the menu to a "⏳ tayyorlanmoqda" state (removes buttons) and restores it after. **Past-month sheets**: `ReportsExcelService.generate` now takes `hidePointInTimeForPastPeriod?` (FinancialExcelQuery) — when set AND the period ends before the current Tashkent month, it drops the five LIVE-state sheets (Balans, Qarzdorlar, KPI paneli, Xonalar bandligi, Guruhlar to'ldirilishi) + the two `bs`/`debtors` Tekshiruv rows (`reconciliationSheet`'s `includePointInTime` param), because those read current DB state and can't be faithfully rebuilt for a past month (no historical cash-balance snapshot). The bot sets the flag on every export; the web `/payments/overview` export leaves it unset (unchanged).

### Activity Report Snapshots (Point-in-Time History)

Powers the `/reports/activity` page so historical periods (e.g. "Feb 2-20" before a capacity change) reflect the **state as of that date**, not the current state.

#### Tables

Four dedicated tables in `prisma/schema.prisma`:

| Table                   | Pattern                        | Tracks                                                   |
| ----------------------- | ------------------------------ | -------------------------------------------------------- |
| `RoomCapacitySnapshot`  | SCD2 (`validFrom` / `validTo`) | Room capacity changes                                    |
| `GroupScheduleSnapshot` | SCD2                           | Group `exactDays`, `lessonStartTime/endTime`, `courseId` |
| `CoursePriceSnapshot`   | SCD2                           | Course price changes                                     |
| `EnrollmentStateLog`    | Event log (`transitionAt`)     | Every enrollment status transition                       |

SCD2 tables: on update, the old row gets `validTo = now()` and a new row is inserted with `validFrom = now()`. Query "state on date X" via `WHERE validFrom <= X AND (validTo IS NULL OR validTo > X)`.

Event log: append-only. Query latest status via `MAX(transitionAt) WHERE transitionAt <= X`. Required because enrollment status can transition multiple times (`ACTIVE → FROZEN → ACTIVE`) — SCD2 single-row-per-current-state can't represent this without a separate intermediate row per change.

#### Write Hooks (mandatory)

Every entity update that touches a tracked field MUST also write a snapshot row. These hooks already exist:

- `RoomsService.create()` / `update()` — capacity hook
- `GroupsWriteService.create()` / `update()` — schedule hook (exactDays / lessonStartTime / lessonEndTime / courseId)
- `CoursesService.create()` / `update()` — price hook
- `StudentEnrollmentService.assignToGroup()` / `removeFromGroup()` — state log
- `StatusCascadeService.cascadeEnrollmentStatus()` — helper used by all cascade transitions (Branch/Course/Group/Student status changes that flip enrollments)
- `ArchiveRestoreService.restoreBatch()` — restore creates ACTIVE event
- `telegram/scenes/student-registration-flow.ts` — telegram bot enrollment

**When adding new code that mutates these fields:** wire the corresponding snapshot write or the activity report will silently use the new value retroactively.

#### Reads (`reports-center-activity.service.ts`)

`loadSnapshots()` fetches all snapshots overlapping the period in one batched query and returns in-memory `Map`s keyed by entity ID. Per-date lookups (`capacityOn`, `scheduleOn`, `priceOn`, `statusOn`) walk the small per-entity arrays. Falls back to current entity values when no snapshot exists (degraded mode for un-backfilled data).

#### Backfill

For existing entities, run the idempotent backfill script after deploying the migration:

```
cd server
npx ts-node scripts/backfill-activity-snapshots.ts --dry-run
npx ts-node scripts/backfill-activity-snapshots.ts
```

Creates one initial snapshot per existing room/group/course (with `validFrom = entity.createdAt`) and one or two state log entries per enrollment (initial ACTIVE + optional transition based on `statusChangedAt`).

### Attendance (Davomat)

- `AttendanceModule` (`src/attendance/`) — manual + QR-based attendance system
- **Two flows:**
  1. **Manual** — teacher/admin marks students via `POST /api/attendance/:groupId/date/:date` with batch entries
  2. **QR** — teacher starts Redis-backed session, students scan QR code, marked as PRESENT in real-time via SSE

#### Date & Time Validation (`validateLessonDate`)

Every attendance write (manual `save()` and QR `startSession()`) passes through `AttendanceService.validateLessonDate()` which enforces:

1. Date format (YYYY-MM-DD)
2. Group existence + multi-tenant `companyId` filter
3. Group status must be `ACTIVE`
4. Date within group `startDate`–`endDate` range
5. Day-of-week matches group `exactDays` schedule
6. Date is not a holiday (`Holiday` table)
7. **Lesson time check** (server-side `new Date()`, not client time):
   - **Teacher** — can only take attendance from 10 minutes before `lessonStartTime` until `lessonEndTime`
   - **CEO, Branch Director, Administrator** — bypass time restriction (can take attendance anytime)
   - Time check only applies to today's date — past dates are not time-restricted

#### QR Session

- Redis-backed session with token rotation every 45 seconds
- Session TTL = `min(remainingTimeUntilLessonEnd, 2 hours)` — auto-expires when lesson ends
- `rotateToken()` preserves remaining TTL instead of resetting to 2 hours
- Lesson number is computed once in `startSession()` and cached in Redis — `scanQr()` reads from cache

#### Concurrency

- `save()` wraps enrollment validation + existing record reads + upserts in `prisma.$transaction()` to prevent race conditions

#### Full-Roster Requirement (`save()`)

- **Manual attendance is all-or-nothing.** `AttendanceSaveService.save()` rejects the request unless `dto.entries` covers every active enrollment the role would render via `getByDate` — partial saves are not allowed. A previous bug let admins/teachers leave students "na bor — na yo'q": only the marked subset was persisted and the rest stayed `null` forever.
- "Expected" set per role (must mirror `getByDate` exactly):
  - **Every role** (Teacher, Admin, BD, CEO) — every active enrollment in the group, debtors included. Debtors used to be hidden from the teacher view; that block was removed when retroactive billing on payment shipped, so the roster is the same shape for everyone now.
- On miss → `BadRequestException("Davomat saqlash uchun barcha o'quvchilarning holati belgilanishi shart. Belgilanmagan o'quvchilar: N ta")`. Validation runs **inside** the `Serializable` tx, so a concurrent enrollment add can't race past it.
- The frontend (`attendance-form.tsx`) mirrors this: the `Saqlash` button is disabled while any visible student has `status === null`, an amber "Belgilanmagan: N ta" badge sits next to it, and `handleSave()` no longer auto-coerces `null → "PRESENT"`. Both layers must stay in sync — never weaken the backend check thinking the UI already prevents the case (API is callable directly).

#### Lesson-sequence dots — enrollment-coverage aware (`getLessonSequence`)

The group "Davomat (nuqtalar)" tab (`attendance-dots-tab.tsx`) renders one dot per recent lesson date per **currently-ACTIVE** student. Unlike `getByDate`, it shows a student against the whole group's lesson history, so a student who **joined mid-stream** or **transferred out and back** would otherwise show a misleading "Belgilanmagan" (unmarked) on lessons held while they were not in the group.

- `getLessonSequence` fetches **all** enrollments for the group (any status, not just ACTIVE) and builds per-student membership **windows** `[startDate, end]` where `end = statusChangedAt` for a closed (DROPPED/TRANSFERRED) enrollment, or open for an ACTIVE one. Tashkent date strings; a `null` start/end means unbounded. A student is "enrolled on date D" if D falls in **any** window (union — handles the transfer-out-then-back gap).
- Each dot carries an `enrolled: boolean`. A blank dot (`status === null`) renders as the actionable **"Belgilanmagan"** only when the student was enrolled that day; otherwise it renders as a distinct, faint **"Guruhda bo'lmagan"** marker (`AttendanceDot`'s `enrolled` prop). An attendance row is itself proof of membership, so non-null statuses are always `enrolled: true`. The roster is still ACTIVE-only, deduped to one row per student.
- This is display-only — it does NOT bill, mark, or alter attendance. It just stops a transferred/re-enrolled student (e.g. transfer out `#032 → #031 → #032`) from looking like the teacher forgot to mark them on dates they were elsewhere.

#### Attendance Method Tracking (`markedMethod`)

- `AttendanceMethod` enum: `MANUAL` | `QR` — stored in `Attendance.markedMethod` field
- `save()` sets `markedMethod = MANUAL`, `scanQr()` sets `markedMethod = QR`
- Existing records default to `MANUAL` (Prisma `@default(MANUAL)`)
- **Future statistics:** combine `markedMethod` + `markedBy` user roles to compute:
  - **QR Code** — `markedMethod = QR`
  - **Teacher (manual)** — `markedMethod = MANUAL` + `markedBy.roles` contains only Teacher
  - **Admin** — `markedMethod = MANUAL` + `markedBy.roles` contains CEO/BD/Administrator

#### Attendance Reminder Notifications

- `AttendanceReminderService` (`src/attendance/attendance-reminder.service.ts`) — `@Cron('0 0,30 7-22 * * 1-6', { timeZone: 'Asia/Tashkent' })` (every 30 min, 07:00–22:00, Mon–Sat) fires six lesson-attendance notifications
- `AttendanceEventsListener` (`src/attendance/attendance-events.listener.ts`) — handles the `attendance.completed` event emitted from `AttendanceService.save()` on the first save of the day
- **Triggers:**

  | #   | When                         | Attendance taken? | Recipient               | NotificationType                                            |
  | --- | ---------------------------- | ----------------- | ----------------------- | ----------------------------------------------------------- |
  | 1   | `lessonStartTime`            | —                 | Teacher                 | `LESSON_STARTED`                                            |
  | 2   | `lessonEndTime - 30 min`     | ❌                | Branch Administrator(s) | `ATTENDANCE_ADMIN_ALERT`                                    |
  | 3   | `lessonEndTime - 15 min`     | ❌                | Teacher                 | `ATTENDANCE_TEACHER_WARNING`                                |
  | 4   | `lessonEndTime`              | ❌                | Teacher                 | `ATTENDANCE_MISSING_TEACHER`                                |
  | 5   | `lessonEndTime`              | ❌                | Branch Administrator(s) | `ATTENDANCE_MISSING_ADMIN`                                  |
  | 6   | On first `save()` of the day | ✅                | Teacher                 | `ATTENDANCE_COMPLETED` (stats: present/absent/late/excused) |

- **Idempotency (no new DB table):** each trigger checks `Notification` for an existing row with the same `(userId, type, relatedEntityType='Group', relatedEntityId=groupId)` created today (Tashkent day). If found → skip. If not → send + insert (the inserted row becomes the idempotency marker for the rest of the day)
- **Auto-stop:** once the teacher marks attendance, triggers 2–5 short-circuit because `attendance.findFirst` returns a row. No cancellation of already-queued notifications is needed
- **Recipients:** `ATTENDANCE_ADMIN_ALERT` / `ATTENDANCE_MISSING_ADMIN` filter users by `roles.role.name = 'Administrator'` AND `branches.branchId = group.branchId`. Branch Directors are NOT included
- **Delivery:** all 6 notifications fan out to the 4 channels (DB + SSE + Web Push + Telegram). Push payloads set `url = /groups/<groupId>`; Telegram messages include plain-text portal URLs (`https://lehrer.dafzentrum.uz` for teachers, `https://admin.dafzentrum.uz` for admins) which Telegram auto-linkifies
- **Skip conditions (cron tick):** group must be `ACTIVE`, not soft-deleted, within `startDate`–`endDate`, today must be in `exactDays`, and the date must not be a `Holiday` (company-scoped or global)
- **Recipient filter (status, isActive, deletedAt):** every notification query that loads `User` recipients (teachers via `Group.teachers`, branch admins via `prisma.user.findMany`, attendance-completed listener, etc.) **must** filter by `deletedAt: null` AND `isActive: true` AND `status: UserStatus.ACTIVE`. Missing any of these three conditions means deactivated, suspended, terminated, or archived users keep receiving notifications — a real bug we have already hit. Defense-in-depth requires all three, even though `UsersService.updateUser()` keeps `isActive` and `status` in sync

#### Per-Student Attendance Telegram Notifications

- **Currently disabled (temporary).** The listener is gated behind the `STUDENT_ATTENDANCE_NOTIFICATIONS_ENABLED` env flag and short-circuits unless it equals `'true'`. Default (unset) = no messages sent. Set `STUDENT_ATTENDANCE_NOTIFICATIONS_ENABLED=true` to re-enable without any code change. The behaviour described below applies only when the flag is on.
- `StudentAttendanceNotificationListener` (`src/attendance/student-attendance-notification.listener.ts`) sends a personal Telegram message to the **student themselves** whenever their attendance status changes to `PRESENT`, `LATE`, or `ABSENT`
- `EXCUSED` is intentionally skipped (no notification when an absence is officially excused)
- **Trigger:** `attendance.student.recorded` event emitted per-entry from both manual `AttendanceSaveService.save()` (post-tx, only for entries where `oldStatus !== newStatus` so idempotent re-saves don't spam) and `QrAttendanceScanService.scanQr()` (per scan, after the early-return for already-PRESENT)
- **Delivery:** Telegram only — uses `Student.telegramChatId` (populated when the student registers via the Telegram bot deep-link). Silently skips students without a chat ID. Telegram API failures are logged at `warn` and never break the attendance save
- **Re-emit on edit:** when an admin later corrects a status (e.g. `ABSENT → PRESENT`), a new message goes out — confirmed business behaviour, not a bug
- Messages are short Uzbek HTML directed at the student in second person ("Darsga keldingiz" / "Darsga kech keldingiz" / "Darsga kelmadingiz") with group name, date (`dd.MM.yyyy`), and `lessonStartTime` when available

#### Advance / Pre-mark Absence (Oldindan davomat belgilash)

`PlannedAbsencesModule` (`src/planned-absences/`) lets an admin pre-mark a single student as not-coming **before** the lesson's attendance is taken (e.g. the student calls in the morning for an afternoon lesson).

- **Why a separate table, not an `Attendance` row:** a real attendance row would (a) bill the student (`ABSENT` is billable — "lesson held = lesson paid") for a lesson that hasn't happened, and (b) trip the teacher-once lock. `PlannedAbsence` is a side-table overlay (same family as `LessonCancellation` / `LessonReschedule`) so it never bills, never locks the teacher, and is invisible to stats / absence-streak queries.
- **Schema:** `PlannedAbsence { groupId, studentId, date, kind (PlannedAbsenceKind = SABABLI | SABABSIZ), note?, createdById, consumedAt?, companyId }`, unique `(groupId, studentId, date)`. Hard-deleted (it is intent, not a financial ledger row — no soft delete).
- **Endpoints** (`@Roles('CEO', 'Branch Director', 'Administrator')`): `POST /api/planned-absences/:groupId/date/:date` (upsert `{ studentId, kind, note? }` — `note` is **required** when `kind = SABABLI`, i.e. an excused absence must record _why_; the service trims it and rejects an empty reason) and `DELETE /api/planned-absences/:id` (only while `consumedAt IS NULL`). The service reuses `AttendanceValidationService.validateLessonDate` (admins bypass the lesson time window, so today-before-the-lesson and any future scheduled date both pass), verifies an active/started enrollment, and rejects if attendance was already taken for that lesson.
- **Pre-fill:** `AttendanceReadService.getByDate` returns `plannedKind` / `plannedNote` / `plannedBy` / `plannedId` per student (the real `status` stays `null` — a pre-mark is not attendance). The attendance form seeds a pre-marked student as `EXCUSED` by default.
- **Consume:** `AttendanceSaveService.save` stamps `consumedAt` on the date's pending pre-marks inside the same Serializable transaction and writes an `Oldindan: sababli/sababsiz` marker onto the `EXCUSED` attendance note when the note is empty (teachers can't write notes themselves).
- **Billing is untouched.** A pre-mark never bills. On finalize both kinds default to `EXCUSED` (no charge); if the student actually shows up the teacher marks `PRESENT` and normal billing applies. **Consequence:** a pre-announced `SABABSIZ` lands as `EXCUSED`, so it does NOT count toward the 3-strike removal streak (accepted product decision).

### Financial System

The financial system is built on an **append-only ledger** principle — financial rows are never destructively edited. Corrections are written as reversal entries linked via `reversedTransactionId`.

#### Core Models

| Model                  | Purpose                               | Key Fields                                                                                                                            |
| ---------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `Payment`              | Student payments (money in)           | `studentId`, `contractId?`, `amount`, `method`, `status`, `source`, `externalId?`, `providerFee?`, `branchId?`                        |
| `Transaction`          | Universal ledger (all money movement) | `type`, `amount` (signed), `balanceBefore`, `balanceAfter`, `reversedTransactionId?`                                                  |
| `Contract`             | Student-course agreement              | `contractNumber` (DAF-YYYY-#####), `totalAmount`, `paidAmount`, `status`                                                              |
| `EmployeeSalaryConfig` | Salary configuration per employee     | `userId`, `groupId?`, `salaryType`, `value`, `isActive`                                                                               |
| `SalaryAccrual`        | Per-lesson teacher earnings           | `userId`, `studentId`, `groupId`, `lessonDate`, `amount`, `deductionTransactionId?`                                                   |
| `SalaryPayment`        | Monthly salary run                    | `userId`, `periodStart/End`, `amount`, `status`                                                                                       |
| `Refund`               | Student refund request/processing     | `studentId`, `contractId`, `requestedAmount`, `approvedAmount?`, `deductions` (JSON), `status`                                        |
| `Expense`              | Company outflows                      | `category`, `amount`, `branchId?`, `relatedUserId?` (for TEACHER_ADVANCE), `settledBySalaryPaymentId?`                                |
| `PaymentGatewayEvent`  | Webhook audit log                     | `provider`, `externalId`, `eventType`, `payload` (JSON), `signatureValid`, `processed`                                                |
| `PaymeTransaction`     | Payme-specific transaction lifecycle  | `paymeId`, `amount` (tiyin), `amountInSom`, `state` (1/2/-1/-2), `studentId`, `createTime`, `performTime`, `cancelTime`, `paymentId?` |

#### Financial Enums

- **PaymentMethod**: `CASH`, `PAYME`, `CLICK`, `UZUM`, `TRANSFER`
- **PaymentStatus**: `PENDING`, `COMPLETED`, `FAILED`, `REFUNDED`, `CANCELLED`, `REVERSED`
- **PaymentSource**: `ADMIN_MANUAL`, `STUDENT_PORTAL`, `GATEWAY_WEBHOOK`, `MANUAL_ATTACH`
- **TransactionType**: `PAYMENT`, `LESSON_DEDUCTION`, `LESSON_CONSUMPTION`, `INITIAL_BALANCE`, `REFUND`, `SALARY_ACCRUAL`, `SALARY_PAYMENT`, `EXPENSE`, `ADJUSTMENT`, `TAX`, `BALANCE_WITHDRAWAL`, `DISCOUNT_ADJUSTMENT`
- **ContractStatus**: `DRAFT`, `ACTIVE`, `COMPLETED`, `CANCELLED`, `REFUNDED`
- **SalaryType**: `PERCENTAGE`, `FIXED_PER_STUDENT`, `FIXED_MONTHLY`
- **SalaryPaymentStatus**: `CALCULATED`, `APPROVED`, `PAID`, `CANCELLED`
- **RefundStatus**: `REQUESTED`, `APPROVED`, `PROCESSING`, `COMPLETED`, `REJECTED`
- **ExpenseCategory**: `RENT`, `UTILITIES`, `SUPPLIES`, `MARKETING`, `TEACHER_ADVANCE`, `OTHER`

#### Payment Module (`src/payments/`)

- **Endpoints**: `POST /payments` (create), `POST /payments/attach-external` (gateway attach), `POST /payments/:id/reverse` (CEO-only), `POST /payments/:id/correct` (CEO/BD/Admin), `GET /payments`, `GET /payments/:id`, `GET /payments/student/:studentId`, `GET /payments/debtors`, `GET /payments/pending-students`, `GET /payments/preview?studentId=X&amount=Y` (pure projection — no mutation; powers the live breakdown card in the record-payment dialog)
- **Roles**: CEO, BD, Admin, Cashier — except reverse (CEO-only) and correct (CEO/BD/Admin, no Cashier)
- **Key rules**:
  - Payment create atomically: creates Payment → records Transaction (PAYMENT) → increments Student.balance → increments Contract.paidAmount
  - Contract-student ownership validated: `contractId` must belong to `studentId`
  - Branch validation: if `contractId` provided, payment `branchId` resolved from contract; mismatch throws `BadRequestException`
  - External payments idempotent via `@@unique([method, externalId, companyId])`
  - Reversed payments excluded from list by default (`status: { not: REVERSED }`); can be queried explicitly with `?status=REVERSED`
  - `source` field returned in all read endpoints for audit
  - Reverse writes Student entity history (`TO'LOV_BEKOR_QILINDI`)
  - Reverse emits `payment.reversed` → `PaymentEventsListener` Telegrams the student that their payment was rolled back
  - `getPending()` uses `balance: { lt: 0 }` (strictly negative, not `lte`)

#### Salary Module (`src/salary/`)

- **Endpoints**: `GET/POST /salary/config`, `POST /salary/config/global`, `PATCH /salary/config/:id`, `GET /salary/accruals/:userId`, `GET /salary/payments`, `GET /salary/monthly` (CEO/BD/Admin — the month-selectable per-teacher report powering the `/payments/salary` page; BD branch-scoped), `GET /salary/monthly/user/:userId` (CEO/BD — the same report narrowed to one user), `GET /salary/monthly/center-topup` (CEO/BD/Admin — the "Qolgan (markaz)" drill-down: which students the center is still owed by), `GET /salary/me/monthly` (any authenticated user — their own row), `GET /salary/overview` (CEO/BD/Admin — paginated live per-teacher current-salary list, now used by the ⚙ Sozlamalar rate list; BD branch-scoped), `GET /salary/staff-config` (**CEO/BD only** — the non-teaching staff rate list behind ⚙ Sozlamalar → "Xodimlar stavkalari"; see below), `POST /salary/calculate` (CEO-only; **cron-internal — no manual UI trigger**), `PATCH /salary/payments/:id/approve` (CEO-only), `POST /salary/payments/:id/pay`, `POST /salary/payments/batch-pay`, `GET /salary/payments/settle-month/preview` (CEO-only), `POST /salary/payments/settle-month` (CEO-only)
- **`SalaryMonthlyService.getMonthly({ month?, search? })`** powers the `/payments/salary` monthly report — one row per teacher for a **selected month** (`YYYY-MM`, defaults to current, clamped up to `Company.systemStartDate`'s month, fallback `2026-05`). Resolves the month to a payroll period via `resolveCurrentPeriod(parseTashkentDateStart(`${month}-15`))` (with `cycleStartDay=1` this is the calendar month), then in **one bulk in-memory pass** over the month's billable attendances computes per teacher a **funder split** that does not depend on whether the month has been settled yet: `covered` (Σ non-reversed accruals **whose `wasCenterTopUp` is false** — the students-paid portion), `centerFunded` (Σ accruals the center funded **plus** Σ still-uncovered billable × rate active at `lessonDate`), `fullDeserved = covered + centerFunded`, `advances` (TEACHER_ADVANCE by `Expense.date` in the calendar month), and `netToPay`. **Settlement only moves money between the two terms of `centerFunded`** — an in-progress month carries the center's leg entirely as the forecast sweep, a settled month entirely as written accruals, and the totals match across the boundary. Summing EVERY accrual into `covered` (the shape before this) meant that the night the cron settled July, 15.5 mln so'm of the centre's own money was relabelled "o'quvchilar to'lagan" and the top-up column dropped to 0 on every surface. A **recovered** top-up stays on the centre's leg for the month it funded (the teacher was paid from centre money then; the pay-back is the separate X/Y/Z lifecycle below), which is why the split reads the sticky `wasCenterTopUp` and not `isCenterTopUp`. `hasLessonData` keys off the accrual TOTAL, not `covered`, so a month the centre funded end to end still renders its columns. The deserved math is the SAME as `scripts/forecast-full-salary-topup.ts`, ported into the shared pure helper `salary/shared/deserved-math.ts` (`perLessonAccrual` + `pickActiveVersion`) — NOT `SalaryAccrualService.findActiveVersion` (that is DB-per-call, wrong shape for a bulk sweep). **Manual/config-gap months (May — accruals never written because configs became effective in June)** have `hasLessonData=false` → `fullDeserved/covered/centerFunded = null` (rendered `—`); the columns are never fabricated from a proxy rate. **Net-to-pay** base is gated per month by `isTopUpMonth` (`salary/shared/topup.ts`, `TOPUP_EFFECTIVE_MONTH='2026-07'`): from July on it is `fullDeserved` (covered + centerFunded); earlier months stay on `covered`. **Since 2026-07 the cron ACTUALLY pays this** (not display-only) — `calculateMonthlySalaries` Phase 0 fronts every uncovered billable lesson with a center-funded `SalaryAccrual` (`isCenterTopUp=true`), so a top-up month's `SalaryPayment.amount` becomes the full deserved salary − advances and the shown `netToPay` for an unsettled top-up month equals what the cron will pay. Already-settled months show their real `payment.amount`. **Avans is never double-subtracted**: when a settled `SalaryPayment` exists, `netToPay = payment.amount` (already net of settled advances per the invariant); only unsettled months compute `base − advances`. **Center top-up lifecycle**: `getMonthly` also returns per-teacher `centerAdvanced` and totals `centerAdvanced` (X) / `centerStillFronted` (Z) / `centerRecovered` (Y = X − Z), computed from the accrual flags — advanced = Σ `wasCenterTopUp`, still-fronted = Σ `isCenterTopUp`. The `/payments/salary` view renders these as a company-level "Markaz qo'shimchasi — undirish holati" card below the table (shown only when `centerAdvanced > 0`, i.e. past settled top-up months; the per-teacher column is `centerFunded`, which is populated in BOTH phases); the Excel "Oyliklar" sheet appends the same X/Y/Z as a "Markaz qo'shimchasi — undirish holati" block (also gated on `centerAdvanced > 0`). **`SalaryAccrual.wasCenterTopUp`** is a STICKY companion to `isCenterTopUp`: set TRUE on any center-funded create, re-asserted TRUE on a gap-sweep re-run, and NEVER cleared (the recovery flip only touches `isCenterTopUp`), so recovered top-ups stay countable (`isCenterTopUp` alone loses that history). Backfill for pre-existing fronted rows: `scripts/backfill-center-topup-tracking.ts`.
- - **`SalaryCenterTopUpService`** answers "who is the center still owed by" behind the card's Z figure. It reads the SAME accruals over the SAME teacher roster as `getMonthly` (both build the clause from `shared/teacher-roster-where.ts`), so `totals.centerPaid` is `===` `getMonthly`'s `totals.centerStillFronted` — two copies of that clause is the one way the card and its own drill-down could disagree. Per student it returns `centerPaid` (what the center paid the TEACHER for this month's fronted lessons) and **`studentDebt` = the student's debt TODAY, the same figure their profile shows**. The month scopes WHO is listed and what the center paid; it does NOT scope the debt. Two attempts to slice the debt by month were both wrong on production July 2026: reporting the month's lesson cost ignores every payment since (#10026 read 345 000 while owing 156 000), and capping at `min(debt, lesson cost)` failed more quietly — #10058 then read 466 662 against a profile saying 624 989, leaving an admin mid-call with two numbers and no rule for choosing. A balance settles oldest-first across every month, so it has no per-month share to report. Students with nothing left to collect are never listed. **Known defect (documented, NOT fixed):** `isCenterTopUp` is cleared only when retroactive billing settles a previously-unbilled lesson, but a debtor's lesson is billed immediately (the balance just goes negative), so a later payment never clears the flag — all 622 July fronted lessons already carried a `LESSON_CONSUMPTION`, and 6 students back at a zero balance were still flagged. The card therefore overstates Z; the drill-down hides those students and states the difference in one line.

**A deactivated employee leaves the payroll list only when their money does.** Both tables on `/payments/salary` drop an `isActive: false` person from the month — but the predicate is the MONTH, not the status: a row survives while it still carries `hasLessonData`, an advance, a `netToPay` or a `SalaryPayment`. A blunt `isActive: true` filter is the tempting simplification and it is wrong — it removes money from the screen AND from the JAMI footer, so a debt exists with nowhere left to see it. Production carried exactly two such people when this shipped: a teacher terminated 27.07 whose May and July payrolls were still `CALCULATED`, and a staff member whose rate closed 17.08 with August's proration unpaid. The teacher table filters explicitly (`salary-monthly.service.ts`, after Step 5+6); the staff table needs no new filter — its existing `monthly === 0 && !payment` drop already does it, and the person falls off by themselves once their last month closes. The filter is SKIPPED when `userId` is set, so `getMonthlyForUser` (profile tab, lehrer portal) never answers "not found" for a person who was asked for by name. Survivors render a «Nofaol» badge so "why is this person still here?" is answered on the row.

**`SalaryMonthlyService.getMonthlyForUser(userId, …)` is the ONE source of a single teacher's salary figures.** It runs the same `getMonthly` pass and returns `{ month, floorMonth, period, row }` — the teacher row, else the non-teaching FIXED_MONTHLY staff row, else `null`. The teacher profile "Ish haqi" tab, both profile cards, the own-profile card and the lehrer portal all render that row. **Never add a screen that computes a teacher's salary itself** — that is exactly how one teacher came to show four different numbers (a forecast, a period-less accrual sum, a raw `User.balance`, and the real report). Scoping lives in `resolveMonthlyScope`'s `userId`: a caller requesting their OWN row (`userId === performedById`) skips BD branch confinement, so an id-exact self lookup can't come back empty on a `UserBranch`/`mainBranch` mismatch; everyone else keeps the normal branch gate. Parity guard: `scripts/verify-per-user-salary-parity.ts` (read-only, compares every teacher's table row to their single-row response field by field).

- **`SalaryStaffConfigService.listStaff` is the write side of the staff payroll.** `SalaryStaffMonthlyService` has surfaced non-teaching FIXED_MONTHLY staff on the monthly report since 2026-07, but it starts from the CONFIGS — and no screen could create one. `/salary/overview` (the only rate list) filters `roles.some.name = 'Teacher'`, and `/payments/salary/config` redirects into it, so the report's empty state told the CEO to go to a screen where no staff member was listed. Production ran with **13 employees and zero salary configs between them**, which is why the section always rendered empty. This service returns each non-teaching employee and their active rate, and nothing else — deliberately NOT a widened `getOverview`, whose per-teacher `actualEarned` / groups / active-students legs are all structurally 0 for a fixed-monthly administrator and would print "earned nothing" beside a salary owed in full. **Student accounts are Users too** (873 of this company's 886 non-teacher users), so the role filter excludes `['Teacher', 'Student']` — excluding Teacher alone buries the 13 real employees. `status` is NOT filtered (a TERMINATED employee's final prorated month is still payable, exactly as the report pays it); `deletedAt` is the hard exclusion and `isActive` rides along so the UI marks them rather than hides them. Rate-less staff sort FIRST — they are the only actionable rows. Branch scoping is the same ceiling-then-narrow rule as `/salary/overview` (`resolvePayrollBranchScope` + `narrowPayrollScope`, fail-closed). Gated **CEO/BD**, narrower than `/salary/overview`, because this list carries the administrative staff's own pay — see the "Salary config" row of `docs/role-access.md`. Writing a rate is still the existing CEO-only `POST /salary/config`.
- **`SalarySummaryService.getTeacherSalarySummary` carries NO monthly money.** It returns group CONTEXT (groupId, name, active students, salary type/value, course price) plus `actualEarned` / `paidTotal` / advances for callers that still want lifetime figures. Its `expectedMonthly` and `expectedPerLesson` forecast fields were **deleted** — they were computed from a hardcoded `exactDays.length * 4` lessons-per-month and contradicted the real report. Do not re-add them.
- **`SalaryOverviewService.getOverview`** reproduces `SalarySummaryService.getTeacherSalarySummary`'s actual-earned math in **bulk** (one query per metric across the page of teachers). No longer the main `/payments/salary` view; now feeds the ⚙ Sozlamalar rate list (teachers + their active configs). `actualEarned` = unpaid (`salaryPaymentId: null`), non-reversed accruals sum.
- **Roles**: CEO, BD
- **Salary types**:
  - `PERCENTAGE` — teacher earns % of per-lesson cost (e.g., 30% of 20,000 = 6,000 per student per lesson)
  - `FIXED_PER_STUDENT` — fixed amount per student per lesson
  - `FIXED_MONTHLY` — flat monthly salary (no accruals, no group dependency) — used for Admin, Cashier, BD
- **Config lookup**: group-specific config takes priority over global (`groupId DESC` — non-null first)
- **FIXED_MONTHLY** cannot be group-scoped (validated on create/update)
- **Accrual coverage rule (B.1)**: `createAccrual()` only writes if `deductionTransactionId` is provided — teachers don't earn for lessons where the student didn't have a paid cycle
- **Period-closed guard → carry-over**: if a lesson date falls inside an APPROVED/PAID (closed) SalaryPayment period, `createAccrual()` no longer refuses. It resolves the current open period and sets `SalaryAccrual.creditPeriodDate` to that period's start so the accrual is paid in the next cycle (labelled "Oldingi oydan" in the UI). `lessonDate` is preserved (still drives the rate version + breakdown display). `creditPeriodDate` is **write-once** (set only in the upsert `create` branch) so re-running retroactive billing can't drift the target. Fallback: if the current period is itself closed (should never happen), it logs an error and returns null. See "Salary carry-over" below.
- **Monthly calculation** (`calculateMonthlySalaries()`):
  - Settles the period that just **COMPLETED**, via `resolveCompletedPeriod()` — NOT the in-progress period `now` is inside. The cron fires on `cycleStartDay`, when the "current" period is the one just starting; settling that would pay an almost-empty window and strand the month that just ended. So on cycleStartDay=8 it pays `[8th previous month → 7th current]` (the closed cycle). Triggering manually any day settles the last completed cycle — you can never accidentally pay an unfinished period. (The teacher's live "joriy davr" breakdown still uses `resolveCurrentPeriod` — that view wants the in-progress period.)
  - **Phase 0 — center top-up (full-deserved payroll, `TOPUP_EFFECTIVE_MONTH='2026-07'`+):** before the accrual sweep, for a top-up period (`isTopUpPeriod`, `salary/shared/topup.ts`) it runs an in-memory **gap sweep** (`computeGapAccruals`, same deserved-math as the monthly report / forecast) and writes a **center-funded `SalaryAccrual`** (`isCenterTopUp=true`, `createAccrual({ centerFunded: true })`) for every uncovered billable lesson (a debtor's PRESENT/LATE/ABSENT slot with no live accrual and a resolvable non-FIXED_MONTHLY rate; EXCUSED and config-gap lessons excluded — no rate fabricated). These are ordinary **unlinked** accruals, so the sweep below picks them up like covered ones → the payment's gross becomes the FULL deserved salary. Runs in per-teacher, chunked Serializable txs; skips teachers whose payment for the period is already APPROVED/PAID (no dangling accruals in a closed window). **Double-pay is impossible:** the accrual's natural key `(userId, studentId, groupId, lessonDate, attendanceId)` means when the student later pays, `settleDeferredAccruals → createAccrual` upserts the SAME row (flipping `isCenterTopUp→false`, "recovered") instead of creating a second one; `applyAccrualToBalance` is idempotent per `(attendanceId, teacherId)`. A never-paid (write-off) lesson keeps `isCenterTopUp=true` — the center's permanent cost. Reverting: bump `TOPUP_EFFECTIVE_MONTH` / return `false` from `isTopUpPeriod` (already-written top-up accruals need reversal if paid). The breakdown drawer shows a "Markaz qo'shimchasi" badge + `centerTopUpTotal`. Dry-run: `scripts/preview-topup-run.ts`.
  - Accrual-based: sums unpaid accruals by effective payroll date (`COALESCE(creditPeriodDate, lessonDate)` ∈ period) — see carry-over below
  - Fixed-monthly: creates payment from config.value (idempotent — skips if exists)
  - TEACHER_ADVANCE expenses settled against salary in `createdAt` order
  - Atomic per user: SalaryPayment + accrual links + advance settlement
- **Cron**: `0 2 * * *` (daily at 2:00 AM Tashkent) — each company-tick checks `isCycleStartDayForCompany()` before triggering calculation (per-company configurable `cycleStartDay`, see `SalaryPeriodSetting` section below)
- **Batch pay**: pays multiple APPROVED salaries; Branch Directors scoped to their `mainBranch`
- **Month settle for payroll paid OUTSIDE the system** (`SalarySettleMonthService`): June and July 2026 were handed over in cash at exactly the calculated amounts, but every `SalaryPayment` stayed `CALCULATED` — so teacher balances carried ~169 mln so'm of payouts that had already happened, and the kassa read 130 mln too high (the ledger held exactly two `SALARY_PAYMENT` rows: a test and its reversal). `POST /salary/payments/settle-month` closes a whole month. It resolves the month through **`resolveMonthlyScope`** — the same helper `/salary/monthly` uses, so the button can never settle a set the table did not show — takes every `CALCULATED`/`APPROVED` row of that period and walks each through `CALCULATED → APPROVED → PAID` with `recordSalaryPayment`. Three things differ from `batchPay`, each load-bearing:
  1. **The kassa accounts are named by the caller, WITH amounts.** `resolveAccountId` picks the branch's OLDEST `CASH` account, which in production is an empty «Asosiy kassa» rather than the «Farg'ona filiali kassa» the money left — booking 130 mln there would be a fiction. `recordSalaryPayment` therefore takes an optional `cashSlices: {cashAccountId, amount}[]` (and `description`), writing **one `CashMovement` per slice** against the single ledger row; omitting it keeps the old resolution and wording exactly. Slices must sum to the payout or it throws. Several movements per transaction are safe: `CashMovement.transactionId` has no unique constraint and `reverseByTransactionId` already unwinds every movement it finds.
  2. **Accounts are a per-branch LIST with amounts, not one id.** Each branch pays its own payroll from its own drawer (D4), so the service rejects an account whose `branchId` does not match the payee's, and requires each branch's named amounts to sum to exactly that branch's payroll. A branch appears TWICE when its payroll went out part cash, part card — which the July 2026 payroll did. `allocateCashSlices` then walks that branch's payments and draws from each account until it is exhausted, letting one payment straddle two accounts. **What that guarantees is each account's total, exactly as stated; it does NOT claim which employee's money came from which drawer** — nobody reconstructs that a month later, and asking would invite guesses. Nothing downstream depends on it: the payment amount, the teacher's balance and the ledger row are per-employee and untouched.
  3. **Validate everything, then write.** `batchPay`'s per-payment `try/catch` is right for a routine run; here the money is irreversible and the operator has just retyped the total, so a missing branch or account aborts the whole batch before anything is written.

  The retyped `confirmAmount` is re-checked server-side — a set that moved after the dialog opened is refused, not partly settled. `PAID`/`CANCELLED` rows never enter the candidate set (which is what makes a repeat call a no-op), and each write re-reads its row inside its own Serializable tx so a concurrent settle is skipped rather than doubled. `SalaryPayment.note` gets a `Tashqarida berilgan oylik tasdiqlandi (<sana>)` marker alongside `paidById`/`paidAt`, and the ledger row's description says the same, so the row explains itself years later.

  **Two consequences to expect.** The month becomes a CLOSED payroll period, so a late student payment settling one of its lessons carries the teacher's accrual forward to the current period via `creditPeriodDate` ("Oldingi oydan") — the designed behaviour, nothing is lost. And **net profit does not move**: `getMonthlyNetProfit` subtracts DESERVED salary, not `paidAt`. What moves is the cash-basis surfaces (`/overview` «Ustoz oyliklari — to'langan», the Excel «Oyliklar» sheet, Foyda-zarar), which is exactly why `paidAt` is the real handover date the CEO enters rather than `now()`.

- **No tax calculation** — the system does not compute or apply taxes. Possible deductions (Ustoz oyligidan 12%, Markaz qo'shimchasi 12%, Markaz daromad solig'i 4%, gateway commissions 2%) are surfaced as a static informational note in the salary UI only — they are not stored, not aggregated, not deducted from any payment

#### Transactions Module (`src/transactions/`) — Universal Ledger

- **Endpoints**: `GET /transactions` (CEO, BD), `GET /transactions/student/:studentId`, `GET /transactions/teacher/:teacherId`, `POST /transactions/adjustment` (CEO, BD)
- **Append-only rules**:
  - All balance changes create Transaction rows — never edit existing rows
  - Reversals create inverse entries linked via `reversedTransactionId`
  - Cannot reverse a reversal (chain kept flat)
  - `SELECT FOR UPDATE` row locking prevents concurrent balance mutations
  - `Serializable` isolation level on all financial transactions
  - `maxWait: 10000, timeout: 15000` configured for Neon serverless cold-start tolerance
- **Methods**: `recordPayment()`, `deductLessonFee()`, `recordRefund()`, `recordSalaryPayment()`, `recordExpense()`, `reverseTransaction()`, `createAdjustment()`

#### The daily snapshot is the one record that cannot be rebuilt

`DailyFinancialSnapshot` — one row per company per Tashkent day, plus one per branch. Every other figure here is derivable from the ledger; this one is not, because «Oy oxiriga kutilyapti» depends on who was enrolled THAT day and the roster has moved by the time anyone asks. A day nobody wrote is gone.

- **`DailySnapshotCron` writes it at 23:40 EVERY day**, Sundays and holidays included, from `DailySnapshotService`. It used to ride on the 21:00 Telegram cron and only after a confirmed send — but that cron skips days off, so those days had no row at all, a month closing on a Sunday had no closing figure, and the debt ▲/▼ delta silently compared against a three-day-old row while the message said "kechagi kundan" (audit H26). **Do not re-attach the write to the send path.** 23:40 rather than 21:00 so a payment entered at 22:00 still lands in its own day.
- **Branch rows are written from the start** even though nothing reads them yet. Adding the dimension later would leave the past permanently blank — and the past is exactly what cannot be rebuilt.
- **It is NOT an upsert.** The compound unique carries a nullable `branchId`, and in Postgres `NULL = NULL` is never true, so an upsert on the company-wide row would never match, always attempt an insert, and be rejected by the partial unique index on every run after the first. `findFirst` (which translates the null to `IS NULL`) then update-or-create is the correct shape. Two indexes back it: `@@unique([companyId, branchId, date])` and the partial `daily_snapshot_company_row_unique ... WHERE "branchId" IS NULL`, because the first does not stop duplicate company-wide rows.
- **Components are stored, the percentage is not.** `lessonsHeldValue` and `collectedForMonth` are written; the collection % is derived on read. A stored copy can drift from its own components.
- One scope failing must not cost the others their row — each is wrapped individually.

`ReportsExpectationHistoryService` reads it back for one month (`GET /reports/expectation-history`, CEO/BD). It **never recomputes a missing day**: the record's whole value is "this is what we actually saw then", and a day rebuilt from today's roster would be a different claim wearing the same shape. Gaps stay gaps, and the chart draws them as gaps.

It also returns per-day `events` — enrolment transitions (`EnrollmentStateLog`), group status changes away from ACTIVE and holiday creations (both from `EntityHistory`; `Holiday` has no `createdAt`, and it is the creation date, not the holiday's own date, that moved the figure). These are counts read from records the system already keeps, never inferred from the figure itself: a step with no matching event stays unexplained rather than acquiring a plausible-sounding reason.

#### One month-end expectation — «Oy oxiriga kutilyapti»

`ReportsExpectationService.getMonthlyExpectation` is the ONE projection of what a month's lessons are worth. It replaced `recognizedRevenueForecast`, which was wrong twice over: `lessonsPerMonth = exactDays.length * 4` treated every month as four weeks (8–13% short on a five-week month), and the walk was rebuilt from whoever was `ACTIVE` at request time, so a student leaving on the 25th was erased from the whole month. June and July both scored the same 148.8 mln — the figure could not tell two months apart. Three copies of that walk existed (`reports-financial`, the Telegram daily report, `salary-overview`); all three are deleted.

- **Lesson value, not cash.** A cash projection needs an "about 82% gets paid" coefficient drawn from two months, and that coefficient bundles prepayment timing, debt and new-enrolment cycles into one number nobody can decompose when it comes out wrong. Cash stays visible through «Tushum (haqiqiy)» and the collection ratio; it is simply not projected.
- **`expectedValue = heldValue + remainingValue`.** The seam is the live `LESSON_CONSUMPTION` row, NOT the attendance row: a debtor's lesson has been taught but no money arrived, so it sits on the remaining side and crosses over by itself when the student pays. Every scheduled student-lesson is therefore counted exactly once.
- **A past date with no attendance projects NOTHING.** Counting it invents revenue (one group's 13 July slots had no attendance since 7 May and never will) and inverts the incentive — the sloppier the data entry, the higher the figure. Consequence to rely on: a CLOSED month projects nothing, so `expectedValue` collapses exactly onto `heldValue`. Production July reads 173 783 991 both ways, the same figure `getRecognizedRevenue` reports.
- **The group query does NOT filter on live status.** A lesson that was held was held; restricting to `statusEnum: ACTIVE` is the H20 defect and dropped 235 of July's 5 143 attendances (8.0 mln). Only the FUTURE projection is limited to active groups, by giving a non-projectable group an empty roster — that must be explicit, because a PAUSED group can still carry ACTIVE enrollments.
- **Future churn is not modelled.** No "historically 5% leave" haircut: it would be a hidden assumption nobody could decompose. The roster is today's; tomorrow's run reflects tomorrow's.
- **Cached one Tashkent day** (`expectation-cache.ts`, same shape as `net-profit-cache`). Safe because a payment moves a lesson from remaining to held and the TOTAL is unchanged. The collection ratio is deliberately NOT cached — it must react to a payment immediately.
- Branch scoping is a CHAIN: only the group query carries `branchId`, everything downstream filters on the ids it returned. `reports-branch-scope-coverage.spec.ts` asserts the chain rather than a per-query predicate.
- `asOf` (optional) replays the month as it looked on a past day — what makes the projection auditable. `scripts/backtest-monthly-expectation.ts` uses it; the closed-month equality above is its self-check.
- Surfaces: `/payments/overview` card, Excel «Asosiy xulosa», the Telegram 21:00 line and the `rm:cfin` card. All four read `ReportsService.getFinancialOverview`'s `income.expected` / `forecast.expectedMonthEnd` or call `getMonthlyExpectation` directly. `ReportsFinancialService.getFinancialOverview` returns `expected: 0` — the facade writes the real value, so a caller reaching that service directly can never pick up a stale forecast.

#### One canonical "Sof foyda" — never re-derive it

`ReportsService.getMonthlyNetProfit` is the ONE net-profit figure. Four surfaces used to compute their own, so the same month showed four numbers:

| Surface                        | Was                                                          | Now                                              |
| ------------------------------ | ------------------------------------------------------------ | ------------------------------------------------ |
| `/overview` Foyda card         | canonical ✅                                                 | unchanged                                        |
| Telegram 21:00 daily report    | `tushum − xarajat − avans` — **no salary subtracted at all** | canonical, with the cash reading on its own line |
| Telegram `rm:cfin` card        | legacy cash `overview.netProfit`                             | canonical                                        |
| Foyda-card click-through chart | legacy cash                                                  | renamed «Kassa oqimi» — see below                |

- The daily report's old formula was the worst: payroll is never written to `Expense`, so **no salary was deducted**, yet advance cash _was_ — and the same message printed the full deserved salary a few lines lower. Both Telegram surfaces now call the canonical figure with a CEO caller (company-wide) and **fall back to an honestly-labelled cash line** if it fails, so a wrong number never wears the "Sof foyda" label.
- The **trend chart now plots the canonical figure too**, made affordable by a per-month **day cache** (`net-profit-cache.ts`). Six months × one `getMonthlyNetProfit` each is roughly ten times the queries of the cash basis, which is why the series was cheap before; a day is the right granularity because these numbers drift slowly (recognised revenue is keyed by attendance date, so a late payment never moves it — only the covered/gap split shifts). The first chart open of the Tashkent day computes, the rest are free.
  - Key is per `(company, branch, month)` so overlapping ranges reuse entries and a branch-filtered view never reads the company-wide figure. TTL runs to the next **Tashkent** midnight.
  - A Redis outage degrades to computing, never to failing; a month whose canonical figure cannot be produced keeps its cash value and is flagged `profitBasis: 'kassa'`, so one bad point never takes the chart down.
  - `getFinancialTrend` (raw, cash) is left untouched for the Excel path; the chart endpoint calls `getFinancialTrendCanonical`.

#### Multi-month Excel export: every profit leg must share one window

`ReportsExcelService.generate` builds "Sof foyda" from several sources, and they must all cover the **same** months. They did not: revenue (`getRecognizedRevenue`) and teacher salary (`getSalaryMonthly`) came from `startDate`'s month alone, while operating expenses (`getProfitLoss`) and refunds (`getPeriodOutflows`) covered the whole selected period. A 3-month export therefore subtracted 3 months of cost from 1 month of income. The yearly preset was worse: `monthStr` became `2026-01`, which has no attendance, so revenue was 0 and the sheet printed the negative of the entire year's expenses as its headline "most accurate" figure.

- `reports-excel.month-range.ts` sums the legs across the period's months. Each month contributes on **its own** top-up basis (`fullDeserved` from `TOPUP_EFFECTIVE_MONTH` on, `covered` before), so gating stays per month; the aggregated object is then passed to `buildNetProfit` **without** a `month` argument.
- **Months before the reporting floor are dropped, not clamped.** `getSalaryMonthly` clamps a too-early month up to `floorMonth`, so summing an unclamped list would count the floor month once per skipped month — the yearly export's core defect.
- `MAX_AGGREGATED_MONTHS` caps the fan-out; a single-month export keeps the original single-call path byte-for-byte.
- The `Oyliklar` sheet still receives the **single-month** `salaries` object — it is a per-month view by design. Only the profit legs are aggregated.
- **The `Tekshiruv` footing cannot catch this class.** It re-adds `np`'s own fields and compares them to `np.netProfit`, which is tautologically equal — an arithmetic check, not a window check. Do not treat a green footing as proof the windows agree.

#### Branch attribution on the ledger (mandatory)

**Every financial row must carry a `branchId`.** A `branchId = null` row is silently dropped from every per-branch report and cannot be re-attributed afterwards, so `Σ(branches)` stops equalling the company total. This is not cosmetic — the business rule (`docs/branch-decisions.md`) is that each branch computes its own P&L from its own income, expenses and payroll.

- **Resolvers live in `src/common/finance/resolve-branch.ts`** — do not re-implement branch lookup at a call site:
  - `resolveStudentBranchId(db, studentId, companyId)` — **fail-closed**, throws when the branch is unknown. Use on every money-writing path: refusing to write beats writing a row nobody can attribute later.
  - `tryResolveStudentBranchId(...)` — null-tolerant variant for read/report paths.
  - `tryResolveUserBranchId(db, userId)` — employee branch (`mainBranch`, else the single `UserBranch` row). Returns `null` for a deliberately branch-less CEO.
- **Student priority is `StudentBranch` first, active enrollment second.** `StudentBranch` is what every read path filters on (`/students?branch_id=`, debtors, balance sheet), so money must be attributed the same way the lists slice it.
- **`TransactionsWriteService` resolves the branch itself** for every student-scoped method, so callers cannot forget. Passing an explicit `branchId` still wins (contract-derived payments rely on this).
- **Cash movements follow the same branch**: a refund or salary payment leaves that branch's kassa, never a company-wide one. **There is no company-level cash account any more** — `CashAccount.branchId` and `Expense.branchId` are `NOT NULL`, `CashAccountsService.create` rejects a branch-less account, and `resolveAccountId` no longer falls back. A movement for a _named_ branch with no account now **throws** instead of no-opping with a warning; only a branch-less caller (a CEO salary, which spans branches) still degrades to a warning. The old fallback is what let 4 refunds and a salary payment drift a company account to −1 107 000 so'm while the branch's balance stayed that much too high.
- **Expense reads are branch-scoped**: `ExpensesService.buildWhere` applies `query.branchId`. It previously accepted the filter and ignored it, so the list, the summary cards and the PDF always showed company-wide figures — under a header that printed the selected branch's name.
- **`SALARY_ACCRUAL` takes the GROUP's branch, not the teacher's**, and it is **stamped (frozen) at write time** rather than joined live — a group that later moves branch must not rewrite settled payroll history.
- **Three services write `Transaction` rows outside `TransactionsWriteService`** and each resolves the branch itself: `salary-accrual.service.ts`, `mock-exam-billing.service.ts`, `withdrawals.service.ts`. If you add a fourth, stamp the branch there too.

#### Branch invariants (one student / one teacher / fixed group branch)

Business rules from `docs/branch-decisions.md`. They exist because a second branch turns every "it only works because there is one branch" shortcut into wrong money.

- **D5 — a student belongs to exactly one branch.** `StudentsWriteService.assertSingleValidBranch` rejects an empty `branchIds`, more than one branch, and a branch that does not exist or belongs to another company. It runs on both `create` and `update`. A branch-less student is absent from every branch-filtered list and their first payment cannot be booked at all (the ledger is fail-closed).
- **Enrolment enforces the same rule.** `StudentEnrollmentService.enrollToGroup` compares the group's branch with the student's: a mismatch is a `400`, and a student with no branch yet **adopts the group's** (the enrolment IS the branch assignment). Without this the student was listed under one branch while their lesson fees and their teacher's pay were booked to another.
- **D6 — a teacher belongs to exactly one branch.** `GroupsWriteService.update` rejects assigning a teacher whose `UserBranch` points at a different branch than the group. A teacher with no branch attached is allowed through (onboarding handles that case) so an unrelated edit is never blocked.
- **A group's branch is fixed at creation.** `UpdateGroupDto.branchId` is deprecated and **discarded** by the service. The client used to send the header switcher's branch on every save, silently moving the group — plus its students, future lesson deductions and salary accruals — into whichever branch the admin was viewing. Moving a group needs a dedicated operation, not a side effect of renaming it.
- **Lead conversion requires a branch.** `LeadsService.convert` throws when neither `branchId` nor a group resolves one.
- **A teacher may not be put in front of a class without a salary rate.** `GroupsWriteService.assertTeachersHaveRate` blocks create/update when an assigned teacher has no active `EmployeeSalaryConfig`. `createAccrual` silently returns null when no rate version covers the lesson date, and a rate cannot be back-dated into a closed payroll period — so those lessons earn the teacher nothing, permanently (this is how ~20 mln so'm went missing in May 2026). The assignment is the last point where it is still fixable.

#### Staff-only list endpoints

`GET /students`, `/branches` (+`:id`), `/rooms` (+`:id`), `/courses` (+`:id`) and `/dashboard/today-schedule` carried **no `@Roles()` at all**. The global `JwtAuthGuard` only proves the caller is logged in — and a student-portal token is a valid login. `studentSelect` returns phone, parent phone, address, passport series and balance, so any student could pull the centre's entire PII database.

- They now carry `@Roles(...STAFF_ROLES)` (`common/decorators/staff-roles.ts`) — every role **except Student**. A narrow whitelist would be wrong: the dashboard is visible to teachers, the payment dialog to cashiers, group screens to all staff. Students read their own data through `student-portal.controller.ts`.
- The controller specs assert the guard **exists** and excludes `Student`. Four of them previously asserted the opposite ("should NOT have @Roles metadata"), which encoded the hole — do not reintroduce that shape.

#### One resolved branch scope per report request

Money reports carried **two** branch parameters — `branchId` (the header switcher's pick) and `branchIds` (the caller's own scope) — and every query decided for itself which to honour. `branchWhere()` made it worse by letting `branchIds` OVERRIDE `branchId`, silently discarding the branch the user actually selected. The result: a Branch Director's workbook printed "Namangan filali" on the cover, Fargona's 162 127 987 so'm on the summary sheet and 0 on the P&L; on the web page the empty Namangan branch reported 27 748 684 so'm of debt across 177 debtors, because `receivables`, `debtors` and `activeStudents` ignored the branch entirely.

- **`common/finance/report-branch-scope.ts` is the only branch logic a report may use.** `resolveCallerReportBranchIds(prisma, userId, requestedBranchId)` is called ONCE at the HTTP boundary; the resolved `ReportBranchIds` is passed down to every leg. `branchWhere()` is deleted, and no report type accepts a bare `branchId` any more — the bug class is unrepresentable.
- **The caller's scope is a CEILING; the requested branch NARROWS within it.** Not the reverse. A branch outside the ceiling resolves to an EMPTY list, never a fallback to the whole scope.
- **`null` = every branch (a CEO who picked nothing). `[]` = NOTHING.** Same fail-closed rule as `payroll-branch-scope.ts`. Controllers **refuse** an empty scope with `403` rather than serving zeros: `getSalaryMonthly` / `getMonthlyNetProfit` re-derive their own scope from `performedById`, so a zero-filled report would still contain that caller's payroll and read as a catastrophic loss.
- **Three predicate shapes, because the branch lives in three places**: `branchIdWhere` (Payment, Expense, Transaction, CashMovement), `studentBranchWhere` (Student — via the `StudentBranch` join, the same predicate every student list uses), `userBranchWhere` (SalaryPayment / SalaryAccrual carry NO branch — it comes from the employee's `mainBranch`/`UserBranch`).
- **Count legs need scoping too.** `getFinancialTrend` / `getYearlyTrend` scoped money by branch but took new-student and unique-payer COUNTS company-wide, so a branch series plotted 0 so'm beside "715 new students". `getReconciliation` took no branch at all, so every workbook's Tekshiruv sheet footed against the whole company.
- **`reports-branch-scope-coverage.spec.ts` is the regression guard**: with a scope set, EVERY query a money report issues must carry a branch predicate. A newly-added unscoped query fails it immediately. `scripts/audit-branch-scope-sum.ts` checks the same invariant (`Σ(branches) == total`) against real data.

#### Object-level branch confinement

A `@Roles()` guard proves the caller has a role, not that the record is theirs. Two id-addressed writes were company-scoped only:

- **`BranchesService.update` / `changeStatus`** — a Branch Director could pass another branch's id and edit or **CLOSE** it. Closing cascades: every group of that branch goes `CANCELLED` and every active enrollment `DROPPED`. `assertCallerMayTouchBranch` now confines non-CEO callers to their own branch and **fails closed** when the caller cannot be identified.
- **`UsersService.updateUser`** — accepts `password`, so a director could take over another branch's accounts. `assertCallerMayTouchUser` requires an overlap between the caller's branches and the target's; editing yourself is always allowed, a CEO spans everything, and a branch-less caller or target is refused.

**Use the shared helpers** in `common/auth/branch-scope.ts` rather than re-deriving this per service:

- `resolveCallerBranchScope(prisma, userId)` → `{ kind: 'all' }` for a CEO (deliberately branch-less, spans everything) or `{ kind: 'branches', branchIds }` for everyone else, merging `mainBranch` and `UserBranch` because different parts of the system wrote one or the other. A non-CEO with no branch gets an **empty** list — nothing, never everything.
- **The scope is a SET, deliberately.** An Administrator normally works in one branch, but attaching several is supported: pick multiple branches on the employee form and they act in each exactly like a local admin. Confining to `mainBranch` alone would lock a multi-branch admin out of every branch but one. `mainBranch` remains the tiebreak for the places that need a single answer (payroll, outreach).
- `assertCallerInBranch(prisma, userId, branchId, message?)` — throws `ForbiddenException` unless the caller may act on that branch.
- **A write with no signed-in caller must SAY so.** `UsersService.create` takes a required `UserWriteActor` — `{ kind: 'user', id }` or `{ kind: 'self-registration' }` — never a bare optional `callerUserId`. Only `self-registration` skips the per-branch caller check, and only because `generateEmployeeLinkPayload` already applied the same branch + role ceiling when it HMAC-signed the invitation link. Treating a missing argument as "skip the check" is what broke Telegram staff registration for twelve days across both branches (see ADR-0008): the bot is the one caller-less path in the system, the branch guard refused it, and a bare `catch {}` in the scene turned a total outage into a polite apology with nothing in the logs. Registration scenes now log the failure. When adding a caller-less path, add an actor variant — do not widen the "no caller" case.

Applied to:

- **Attendance** (`attendance.controller.verifyGroupAccess`) — attendance is a money path: saving it deducts from student balances and writes teacher accruals. Only pure teachers were checked, so an Administrator or Branch Director of one branch could take attendance for ANOTHER branch's group, billing its students and paying its teacher. A pure teacher is still checked by group assignment (the stronger test); everyone else by branch.
- **Cash accounts** (`CashAccountsService.findOne(id, companyId, userId?)`) — `findAll` scoped by branch but every id-addressed operation (movements, patch, delete, transfer, reconcile) checked only `companyId`, so a director could transfer money out of the other branch's kassa or post an adjustment to it. Pass `userId` on any path that reads or moves an account's money; `transfer` checks **both** sides.

When adding a new id-addressed mutation, check the record's branch against the caller's — `companyId` alone is not a boundary once there is more than one branch.

#### Registration deep links

- **Teacher onboarding goes through the SIGNED `employee_<branch>_roles_<ids>_sig_<hmac>` link only.** The legacy unsigned `teacher_<branchId>` payload is **retired** — it carried no signature, so anyone holding one could edit the number and register as a teacher of any branch. `/start` answers old links with "ask for a new link" rather than failing silently. The client mints links via `POST /telegram/employee-link` (see `useTeacherRegistrationLink`); never build a payload in the browser.
- **A link IS an account, so the issuer's own role caps what it may grant.** `GRANTABLE_ROLE_IDS` (`telegram/constants.ts`): CEO → all, Branch Director → Administrator/Teacher/Cashier, Administrator → Teacher/Cashier. Without this ceiling an Administrator could mint a CEO link for their own branch and grant themselves full access — the existing branch check would not stop them. The dialog hides non-grantable roles; the service re-checks.
- **Branch lookups in `/start` handlers filter `deletedAt: null` + `status: 'ACTIVE'`** so an archived or closed branch cannot accept new registrations.

#### Contracts (model retained, user-facing CRUD module removed)

- The dedicated `src/contracts/` module (controller + service + DTOs, the `/contracts` CRUD endpoints) and the `/payments/contracts` admin page were **removed** — contracts were never wired into the real workflow (nothing auto-creates them; the live billing model is prepaid-balance, not contract-based), so the page sat permanently empty.
- The **`Contract` Prisma model is intentionally kept** — it is load-bearing infrastructure referenced by `billing` (`group.contracts[0]?.id` on every lesson deduction), `payments` (`Payment.contractId`, `Contract.paidAmount`), `refunds`, `transactions` (`Transaction.contractId`), `reports` (group/course joins via `contract`), and `receipts` (`contractNumber`). All these fields are currently `null` in practice but the code paths depend on the relation. Do **not** drop the model or `contractId` FKs without a dedicated migration.
- If contracts are ever revived as a feature, re-add a CRUD module — `contractNumber` was auto-generated `DAF-YYYY-#####` (atomic per-year sequence), `paidAmount` was auto-updated by payment/refund flows, and status transitions were `DRAFT → [ACTIVE, CANCELLED]`, `ACTIVE → [COMPLETED, CANCELLED, REFUNDED]`.

#### Refunds Module (`src/refunds/`)

- **Endpoints**: `GET /refunds/preview/:studentId`, `POST /refunds/quick`, `GET /refunds`, `PATCH /refunds/:id/process`, `POST /refunds/:id/reverse` (CEO-only)
- **A refund is funded from exactly two places**: the student's free balance, and the lessons they have paid for but not yet taken (`Enrollment.prepaidLessonsRemaining`). Money already spent on attended lessons is gone. **ABSENT counts as attended here** — a held lesson is a billed lesson.
  - `maxRefundable = max(0, balance + prepaidRefundValue(prepaidLessonsRemaining))`
  - Free balance is drawn first. Only the shortfall comes out of the lessons, and `quickRefund` cancels the **fewest** lessons that cover it — walking up from one lesson rather than dividing, because a cycle's last lesson absorbs the rounding remainder and is not the base price.
  - Cancelling means `EnrollmentBillingService.releasePrepaidLessons`: credit their money via an `ADJUSTMENT` **and decrement the counter in the same step**. The student leaves with fewer lessons ahead of them, which is what taking the money back means.
- **Never re-derive "unused lessons" from attendance.** The version removed in 2026-08 computed `overDeducted = lesson deductions − PRESENT/LATE attendance` and credited it back. The ledger deducts exactly `attendance + prepaidLessonsRemaining`, so that difference is _always_ the ABSENT lessons plus lessons still reserved — never over-deduction. It credited money nobody had paid, left `prepaidLessonsRemaining` untouched so the same lessons stayed covered (one payment counted twice), and since neither side of the subtraction changed, **every subsequent refund offered the whole thing again**. #10393 gained 266 664 so'm on 2026-08-18 and its refund ceiling ROSE from 266 681 to 433 345; #10655 gained 233 331 in July and had to be cleaned up by hand. 281 of 420 active enrollments were exposed, 54.9 mln so'm in total.
- **Pricing goes through `EnrollmentBillingService.prepaidRefundValue`** — the batch's own `amount`, so discounts, contract prices and the cycle rounding remainder are all already in it. Do not recompute `course.price / lessonPaymentCount` at a call site; that figure ignores the student's discount.
- **`reverse()` unwinds both halves.** The release `ADJUSTMENT` is tagged `metadata = { refundId, lessonsReleased }` (Transaction has no refund FK), so reversing a refund reverses that row too and increments `prepaidLessonsRemaining` back. Reversing only the payout leaves the student holding the credit AND missing the lessons.
- **No "% of course" rule.** The old 50%-completed gate divided by `lessonPaymentCount`, which is the size of a **billing cycle**, not the course — a student 19 lessons into a 12-lesson cycle read as "158% attended". There is no total-lessons figure in the schema to divide by, so the warning was removed rather than made up. The preview warns about something true instead (no prepaid lessons → balance only).
- **`quickRefund` is idempotent-ish at the door**: an identical `(student, enrollment, amount)` COMPLETED refund inside 60 s is refused. The dialog's disabled button is not protection against a retry, a second tab, or a direct API call.
- The old `POST /refunds` request/approve flow was **deleted** — no screen ever called it, and it computed `paidAmount` at student level against `consumedAmount` at enrollment level, over-refunding anyone in more than one group.
- **Status transitions**: `REQUESTED → [APPROVED, REJECTED]`, `APPROVED → [PROCESSING, COMPLETED]`, `PROCESSING → COMPLETED`. `quickRefund` writes `COMPLETED` directly.
- Reverse CEO-only; contract stays REFUNDED (manual re-open if needed)

#### Expenses Module (`src/expenses/`)

- **Endpoints**: `POST /expenses`, `GET /expenses`, `PATCH /expenses/:id`, `DELETE /expenses/:id`
- **Roles**: CEO, BD (create/update/delete) — Administrator was removed so the whole `/payments/expenses` page can be hidden from admins
- **TEACHER_ADVANCE** category: requires `relatedUserId`; settled against future salary in `SalaryService.applyPendingAdvances()`
- **Advance surfacing in the salary view (display-only)**: a settled advance reduces `SalaryPayment.amount`, so the salary view used to show only the net and the advance was invisible (lived only under Expenses). The salary read endpoints now surface advances as part of pay — `salary-summary.service.ts` returns `advancesTotal` (all non-deleted TEACHER_ADVANCE for the teacher) + `advancesPending` (unsettled), `salary-breakdown.service.ts` `getPaymentBreakdown` returns `settledAdvances[]` / `settledAdvancesTotal` / `grossTotal` (= net `amount` + settled advances; works for FIXED_MONTHLY where accrual total is 0), and `salary-payment.service.ts` `findPayments` adds per-row `advancesTotal` / `grossAmount`. **Invariant:** `paidTotal + advancesTotal` reconstructs gross cash given with no double-count (a settled advance was subtracted from the payment it settled against). The ledger is untouched — this is a reporting change only.
- Financial field changes (amount, category, relatedUserId) trigger ledger reversal + re-post
- Soft delete cascades ledger reversal

#### Reports Module (`src/reports/`)

- **Endpoints**: `GET /reports/financial-overview`, `GET /reports/financial-trend`, `GET /reports/monthly-debt-recovery`, `GET /reports/kpis`, and more
- **Roles**: CEO, BD (money reports). `financial-trend` is `@Roles('CEO', 'Branch Director')`.
- **`financial-overview` role split (deliberate — do NOT re-tighten to CEO/BD-only)**: the endpoint is `@Roles('CEO', 'Branch Director', 'Administrator', 'Cashier')`, but CEO/BD get the FULL payload while Administrator + Cashier get a stripped **operational-only** subset — `{ ltvPayerCount, avgPayment }` and nothing else. The controller does this redaction at the HTTP boundary (reads `@CurrentUser()` roles; returns full only when the caller has `'CEO'` or `'Branch Director'`), so a direct API call by an admin/cashier can't leak income/expenses/profit/salary/LTV/CAC/ROI/forecast/debt. This backs the `/payments/overview` UI where ordinary admins see only the "To'lov qilganlar" + "O'rtacha to'lov" cards (the 6 money cards and the Prognoz/Oyliklar/Qarzdorlik/To'lov-usullari blocks are `canSeeFinancials` gated, CEO/BD only). Redaction lives in the controller ONLY — `ReportsFinancialService.getFinancialOverview` still returns everything (the Telegram `rm:cfin` group card calls the service directly with a CEO scope and must keep the full figures).
- **Financial overview** calculates: income (actual vs forecast), salary (paid + pending with tax), expenses, net profit, LTV, CAC, marketing ROI, avg payment, debtors
- **Debt by the month it arose** (`GET /reports/monthly-debt-recovery/history` + `/:monthKey/aging`, CEO/BD; `ReportsDebtHistoryService`): what the `/payments/debt-history` page shows. TODAY's debt, split by the month each unpaid charge landed in — disjoint buckets, so the column sums EXACTLY to the live total and the page's «Jami» row is real. One chronological ledger replay produces all of it: the aging split, each month's own created debt, the current status breakdown (Faol / Chetlatilgan / Muzlatilgan / Arxiv, which doubles as the page filter) and the longest-standing debtors. Reversals are NOT filtered — `reverseTransaction` writes its counter-row with the original's type, so both halves net to zero; filtering `reversedAt: null` keeps the undo and drops the original. It replaced a month-end-BALANCE series that could not answer the question being asked: a frozen debtor showed the same cumulative figure under every month (#10399 read 815 163 under both June and July), and overlapping balances meant the total row had to stay blank — the old «Jami» printed 317 mln against 83.75 mln actually outstanding, counting 551 distinct debtors 1 573 times.
- **Month-end debt + recovery** (`GET /reports/monthly-debt-recovery`, CEO/BD; `ReportsFinancialService.getMonthlyDebtRecovery`) — the COHORT view, still used by the Excel workbook. Its rows must NEVER be summed across months (nested windows). The drill-down does not filter reversals either, and claims a write-off BEFORE a payment when both compete for the same capped debt, so forgiveness is not squeezed out of the column: per Tashkent calendar month (from `systemStartDate`), the total student debt the center CLOSED THAT MONTH WITH plus how much of that cohort has since been recovered. **Reconstructed from the append-only `Transaction` ledger — no snapshot table.** `balanceAsOf(monthEnd)_i = Student.balance_i − Σ(Transaction.amount WHERE studentId=i AND createdAt >= nextMonthStart)` — the full signed sum (all types incl. reversed, which net out) reconciles exactly to the live balance, so each past month-end is derivable AND stable (corrections land at `createdAt = now()`, never rewriting the past). Cohort = balanceAsOf < 0 across **any status** (not just ACTIVE, no `deletedAt` filter). `recovered_i = min(debt_i, Σ PAYMENT after monthEnd)` (oldest-first cap); `DEBT_WRITE_OFF` is a separate "kechirilgan" column. Surfaces as the Excel "Oylik qarzdorlik" sheet (past-safe, never dropped) and the `/payments/debt-history` page. Do NOT copy the old report's `status:'ACTIVE'`/`deletedAt:null` filters into the cohort query, and do NOT filter `reversedAt` in the reconstruction — both silently corrupt the numbers.
- **Teacher advances reclassified into salary (display-only)**: `getFinancialOverview` pulls TEACHER_ADVANCE expenses OUT of the `expenses` bucket and folds them INTO `salary.paid` (an avans is cash paid to a teacher, not a generic Xarajat), and returns `salary.advances` so the UI shows a "shundan avans" sub-line under "Ustoz oyliklari → To'langan". The combined outflow (`expenses + salary.paid`) and `netProfit` are unchanged — only the split shifts, so there is no double-count. Same idea as the salary-view advance surfacing (see Expenses Module → "Advance surfacing")
- Income filters by `status: COMPLETED` — REVERSED payments excluded automatically
- All queries support `branchId` and `startDate/endDate` filters

#### Payme (Paycom) Merchant API (`src/payment-gateways/payme/`)

Full integration with Paycom's JSON-RPC 2.0 Merchant API. Paycom sends requests to our webhook endpoint; we validate and respond.

- **Webhook endpoint**: `POST /api/gateways/payme/webhook?companyId=<id>` (public, no JWT — authenticated via Basic Auth)
- **Authentication**: `Authorization: Basic base64("Paycom:<MERCHANT_KEY>")` — verified with `crypto.timingSafeEqual()`
- **Account field**: `student_id` — identifies the paying student
- **Amount**: Paycom sends amounts in **tiyin** (1 so'm = 100 tiyin); we store both `amount` (tiyin) and `amountInSom` in `PaymeTransaction`
- **Files**:
  - `payme.service.ts` — JSON-RPC dispatcher + Basic Auth verification
  - `payme-methods.service.ts` — 6 required RPC methods
  - `payme-errors.ts` — error codes with tri-lingual messages (uz/ru/en)
  - `payme.types.ts` — TypeScript interfaces for request/response
  - **Expiry handling is inline** (no cron) — `createTransaction` and `performTransaction` self-cancel `state=1` rows older than 12h via `cancelExpired()`. Payme also cancels on their side

**6 RPC Methods**:

| Method                    | Purpose                              | Key Logic                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CheckPerformTransaction` | Validate if payment is possible      | Checks student exists + amount > 0                                                                                                                                                                                                                                                                                                                             |
| `CreateTransaction`       | Create pending transaction (state=1) | Idempotent by `paymeId`; cancels existing pending txns for same student                                                                                                                                                                                                                                                                                        |
| `PerformTransaction`      | Complete payment (state=2)           | Calls `PaymentsService.createFromExternal()` to credit student balance                                                                                                                                                                                                                                                                                         |
| `CancelTransaction`       | Cancel transaction                   | state=1→-1 (no financial impact); state=2→reverse the linked ERP payment then mark -2. Returns error -31007 (CANNOT_CANCEL) **only** when the reversal is blocked (funds already spent on lessons) — left state=2 for the admin to resolve. Reversal + the -2 write happen before responding so Payme is never told "refunded" while the balance is still out. |
| `CheckTransaction`        | Get transaction status               | Returns full state                                                                                                                                                                                                                                                                                                                                             |
| `GetStatement`            | List transactions in time range      | For Paycom reconciliation                                                                                                                                                                                                                                                                                                                                      |

**Transaction states**: 1=created, 2=performed, -1=cancelled, -2=refunded

**Student Portal checkout** (`POST /api/student-portal/payments/init`):

- Student selects Payme + enters amount → backend generates checkout URL → frontend redirects to Payme
- Checkout URL format: `https://checkout.paycom.uz/{base64(params)}` (production) or `https://test.paycom.uz/{base64(params)}` (test)
- After payment, Paycom calls our webhook with the 6 RPC methods above

**Full Payme reference docs (Uzbek)**: `docs/payme-uz/index.html` — comprehensive 25-page documentation site mirroring `developer.help.paycom.uz` structure. Covers Merchant API protocol + all 6 methods with JSON examples, Subscribe API (cards tokenization + receipts), checkout initialization (GET base64 / POST form / button / QR), sandbox scenarios, error code reference (`-32xxx` transport + `-31xxx` business), and mobile deep-link integration. Use this as the authoritative reference when modifying Payme-related code.

#### Click SHOP-API (`src/payment-gateways/click/`)

Full integration with Click's two-phase SHOP-API. Click sends POST requests to our webhook endpoint with Prepare (action=0) and Complete (action=1) phases.

- **Webhook endpoint**: `POST /api/gateways/click/webhook?companyId=<id>` (public, no JWT — authenticated via MD5 signature)
- **Authentication**: MD5 hash of `click_trans_id + service_id + SECRET_KEY + merchant_trans_id + [merchant_prepare_id] + amount + action + sign_time` — verified with `crypto.timingSafeEqual()`
- **Account field**: `merchant_trans_id` = `studentId` — identifies the paying student
- **Amount**: Click sends amounts in **so'm** (not tiyin like Payme); stored as `amount` (Float) and `amountInSom` (Int) in `ClickTransaction`
- **Files**:
  - `click.service.ts` — MD5 signature verifier + action dispatcher
  - `click-methods.service.ts` — Prepare and Complete business logic
  - `click-errors.ts` — error codes (-1 to -9) with tri-lingual messages (uz/ru/en)
  - `click.types.ts` — TypeScript interfaces for request/response
  - **Expiry handling is inline** (no cron) — `prepare()` and `complete()` self-cancel `status=1` rows older than 30 min via `cancelExpired()`. Late `Complete` on a stale Prepare returns `CLICK_TRANSACTION_CANCELLED` to prevent crediting balances after timeout

**Two-phase webhook flow**:

| Phase      | Action | Purpose              | Key Logic                                                                                |
| ---------- | ------ | -------------------- | ---------------------------------------------------------------------------------------- |
| `Prepare`  | 0      | Validate and reserve | Checks student exists + amount > 0; creates `ClickTransaction` (status=1)                |
| `Complete` | 1      | Confirm and finalize | Calls `PaymentsService.createFromExternal()` to credit student balance; updates status=2 |

**Error codes** (returned by us):

| Code | Meaning                                   |
| ---- | ----------------------------------------- |
| 0    | Success                                   |
| -1   | SIGN CHECK FAILED (invalid MD5 signature) |
| -2   | Incorrect parameter amount                |
| -4   | Already paid                              |
| -5   | User does not exist                       |
| -6   | Transaction does not exist                |
| -9   | Transaction cancelled                     |

**Transaction states**: 0=pending, 1=prepared, 2=completed, -1=cancelled

**Student Portal checkout** (`POST /api/student-portal/payments/init` with `method: "CLICK"`):

- Student selects Click + enters amount → backend generates redirect URL → frontend redirects to Click
- Redirect URL: `https://my.click.uz/services/pay?service_id=X&merchant_id=X&amount=X&transaction_param=studentId&return_url=X`
- After payment, Click calls our webhook with Prepare then Complete

#### Attendance → Finance Integration (Prepaid Billing Model)

The billing model is **prepaid-by-batch**, not cycle-boundary. Both manual and QR attendance flows delegate to `LessonBillingService.processAttendanceBilling(tx, ...)`. There is no other path that mutates student balance, prepaid counters, or salary accruals — this single service is the source of truth.

**Key invariant:** every attendance write runs inside `prisma.$transaction(Serializable)` with `LessonBillingService` called from the same `tx`. The attendance row, `LESSON_DEDUCTION` (when applicable), `LESSON_CONSUMPTION` audit row, prepaid decrement, and `SalaryAccrual` write are all-or-nothing.

##### Status transition matrix

**ABSENT IS BILLABLE.** The rule is "a lesson held is a lesson paid": the
student's quota is consumed for any status confirming the lesson took place,
whether or not they showed up. Only `EXCUSED` ("uzrli sabab — kechirildi")
and cancelled lessons skip billing. The one line of truth is
`BILLABLE` in `billing/lesson-billing.service.ts`, and the whole decision is
`wasBillable` vs `isBillable` — there is no per-pair table in the code.

An earlier version of this matrix grouped ABSENT with EXCUSED. It cost a real
investigation (student #10061) before anyone checked the code, which is why
the set is written out here rather than described.

|               | PRESENT | LATE | ABSENT  | EXCUSED |
| ------------- | ------- | ---- | ------- | ------- |
| **billable?** | yes     | yes  | **yes** | no      |

| oldStatus               | newStatus                   | Action                                                   |
| ----------------------- | --------------------------- | -------------------------------------------------------- |
| (yo'q)                  | PRESENT / LATE / **ABSENT** | **bill** (consume or refill)                             |
| (yo'q)                  | EXCUSED                     | no-op                                                    |
| EXCUSED                 | PRESENT / LATE / **ABSENT** | **bill**                                                 |
| PRESENT / LATE / ABSENT | EXCUSED                     | **reverse** (consumption + prepaid +1 + accrual reverse) |
| PRESENT / LATE / ABSENT | PRESENT / LATE / ABSENT     | no-op — both sides billable                              |
| EXCUSED                 | EXCUSED                     | no-op                                                    |

##### Billing algorithm (billable branch)

1. **Idempotency**: skip if a non-reversed `LESSON_CONSUMPTION` already exists for `attendanceId`.
2. **Lock** `Enrollment` row (`SELECT FOR UPDATE`).
3. If `enrollment.prepaidLessonsRemaining > 0`:
   - Decrement by 1.
   - Coverage tx for accrual = most recent `LESSON_DEDUCTION` on this enrollment.
4. Else (need to refill):
   - Lock student balance.
   - `balance >= fullCycleCost` → deduct full price, set `prepaidLessonsRemaining = lessonPaymentCount`, decrement.
   - `balance >= perLessonCost` → partial: `floor(balance / perLessonCost)` lessons, deduct `N × perLessonCost`, set prepaid = N, decrement.
   - `balance < perLessonCost` → no deduction, no accrual, no consumption (B.1 preserved).
5. Write `LESSON_CONSUMPTION` audit row (amount=0, balance unchanged, metadata = `{ perLessonCost }`).
6. Create `SalaryAccrual` for each `group.teachers` linked to the coverage tx.

##### Reverse algorithm (PRESENT/LATE → ABSENT/EXCUSED)

1. Find active `LESSON_CONSUMPTION` for this attendance.
2. If found:
   - `reverseTransaction(consumption.id, ...)` (which sets `reversedAt` on the original — see "Reversal markers" below).
   - `prepaidLessonsRemaining +=1`.
3. Reverse linked `SalaryAccrual` (set `reversedAt`/`reversedById`/`reversalReason`).
4. If consumption was **never** written (insufficient balance — Misol 7): only the accrual reverse runs; **prepaid is NOT incremented** (no free lessons).

##### Reversal markers (`Transaction.reversedAt`)

`reverseTransaction()` writes a new reversal row AND sets `reversedAt`/`reversedById` on the original. All "still-active" filters (idempotency checks, partial unique indexes, downstream consumption queries, refund eligibility, debt aggregations) use `reversedAt: null` as the canonical "this row is still in effect" predicate.

Two partial unique indexes back this:

- `tx_consumption_per_attendance_unique`: `(attendanceId) WHERE type='LESSON_CONSUMPTION' AND reversedAt IS NULL`
- `tx_initial_balance_per_student_unique`: `(studentId) WHERE type='INITIAL_BALANCE' AND reversedAt IS NULL`

##### A cycle costs exactly its price (`billing/lesson-price.ts`)

`Math.round(price / lessonCount)` per lesson does not add back up: 400 000 / 12 billed twelve times is 399 996, and 500 000 / 12 is 500 **004** — the centre overcharging four so'm every cycle. Charged lesson by lesson to a debtor the error accumulates on the balance, which is where four of the eight sub-1000 so'm debtors on production came from (their debt was an exact multiple of their course's cycle error).

- Every lesson keeps the familiar `baseLessonPrice`; the cycle's **last** lesson is charged `cycleCost − base × (n−1)`. Spreading the remainder across the cycle would also close the books but makes scattered lessons cost one so'm more for no reason a student can be told.
- **`Enrollment.cycleLessonIndex`** exists only for `SINGLE_UNCOVERED` — the one path with no prepaid batch, and therefore nothing else recording that the next lesson is the cycle's last. `FULL_CYCLE`/`PARTIAL` deduct a lump sum and reset it to 0 (a batch starts a fresh cycle); `reverse()` steps it back with an atomic `GREATEST(x − 1, 0)`.
- **`PARTIAL` must use `lessonsAffordable()`**, not `floor(balance / perLessonCost)`: the final lesson can cost more than the base figure, so the naive count picks one lesson too many and overdraws a branch whose contract is that it never drives the balance negative.
- **Discount applies to the CYCLE, then the split** — discounting the per-lesson figure reintroduces the drift.
- `metadata.perLessonCost` keeps its meaning (the nominal figure); the truth of what was charged is `amount`. The prepaid refund prices against the batch's own `amount` rather than per lesson, so refund + consumed always reconstruct what was deducted — which also fixed a pre-existing over-refund for discounted students.

##### Salary accrual gate (B.1)

`createAccrual()` only writes when a non-reversed `LESSON_DEDUCTION` (the `coverage` tx) exists for the lesson. Closed-period guard: refuses to write into an APPROVED/PAID `SalaryPayment` window.

`SalaryCalculation` excludes accruals with `reversedAt: null` so reversed lessons don't pay teachers.

##### Lesson-deduction reversal endpoint

`POST /billing/lesson-deduction/:id/reverse` (CEO/BD) — undoes an entire prepaid batch:

- Reverses the deduction (balance restored).
- Reverses every linked `SalaryAccrual`.
- Reverses every `LESSON_CONSUMPTION` for the same enrollment dated after the batch.
- Resets `enrollment.prepaidLessonsRemaining = 0`.

Use case: admin entered the wrong cycle, wrong group, or wrong amount. Distinct from the per-attendance flip (which handles "this single lesson didn't happen").

##### Retroactive billing on payment

Debtors (`balance < perLessonCost`) can be marked PRESENT/LATE just like any other student — `attendance-save` and `qr-attendance-scan` no longer block them, and the teacher attendance roster shows them inline with a "Qarz" badge. When the lesson is held the billing layer skips deduction/consumption/accrual (B.1 still preserved), so nothing financial happens at the time.

The catch-up runs the moment money lands: `PaymentsWriteService.create()` and `createFromExternal()` both invoke `LessonBillingService.processRetroactiveBillingForStudent(tx, ...)` from inside the same Serializable payment transaction. It walks every active enrollment, picks unpaid PRESENT/LATE/ABSENT attendance (no active `LESSON_CONSUMPTION`) **oldest-first**, and iteratively delegates to `bill()` — the same private method the live attendance flow uses. Each iteration:

- Re-reads the live balance and `prepaidLessonsRemaining`.
- Picks full / partial / insufficient just like a fresh attendance write would.
- Verifies a `LESSON_CONSUMPTION` was actually written; if not (balance ran out), breaks out of the loop for that enrollment.

Idempotent — calling it on a student with everything already settled is a no-op (the `LESSON_CONSUMPTION` idempotency guard inside `bill()` short-circuits).

Manual trigger: `POST /billing/retroactive/:studentId` (CEO/BD/Admin) opens its own Serializable tx via `runRetroactiveBilling()`. Used for legacy/migration cleanup or admin-driven recovery; the regular payment pipeline already invokes it automatically.

**Salary period closed → carry-over**: if a retroactively-settled lesson date falls inside an APPROVED/PAID `SalaryPayment` window, `createAccrual` no longer skips. It carries the accrual into the current open period via `creditPeriodDate` (see "Salary carry-over (late payment)" below) so the teacher is paid automatically in the next cycle. Only if the current period is also closed does it log an error and skip (then admin handles via balance-withdrawal).

#### Salary carry-over (late payment) — `SalaryAccrual.creditPeriodDate`

When a student pays late and retroactive billing settles a lesson whose own payroll period is already closed (APPROVED/PAID), the teacher's accrual would otherwise be lost. Instead it is **carried over** to the current open period.

- **Schema**: `SalaryAccrual.creditPeriodDate DateTime?` (full timestamp, NOT `@db.Date` — avoids Tashkent-offset truncation breaking range comparisons). NULL = bucket by `lessonDate` (default, unchanged). Non-null = bucket into the period containing this date instead.
- **Bucketing**: every payroll query that slices accruals by period uses an effective-date OR — `OR: [{ creditPeriodDate: { gte, lte } }, { creditPeriodDate: null, lessonDate: { gte, lte } }]`. Applied in `salary-calculation.service.ts` (the monthly sweep) and `salary-breakdown.service.ts` (`getCurrentCycleBreakdown`). Summary/reports queries have no period filter so they pick up carry-overs automatically.
- **Rate is unaffected**: `findActiveVersion` still keys off the original `lessonDate`, so a past lesson keeps its past rate.
- **Notification**: `createAccrual` pushes a `CarriedOverAccrual` into an optional `carriedOverSink` (threaded from `LessonBillingService.processRetroactiveBillingForStudent` → `bill()`/`settleDeferredAccruals`). `PaymentsWriteService.create()`/`createFromExternal()` collect the list and emit `salary.carried-over` **after the tx commits** (gated on `!outerTx`, like the receipt). `NotificationEventsListener` groups by teacher and fans out one message per teacher across all four channels.
- **UI**: breakdown lines expose `isCarriedOver`; totals expose `carriedOverTotal`/`carriedOverCount`. A purple "Oldingi oydan" badge + a "shundan oldingi oydan" subtotal show on both the admin `salary-breakdown-drawer.tsx` and the teacher `teacher-salary-client.tsx`.
- **Limitation**: accruals lost to the _old_ refuse-and-log behaviour (before this shipped) can't be auto-recovered — admin uses Balance Withdrawal `creditTeacher`.

#### Salary Versioning (`EmployeeSalaryConfigVersion`)

Every salary config write (PERCENTAGE / FIXED_PER_STUDENT / FIXED_MONTHLY) creates an SCD2 version row alongside the parent `EmployeeSalaryConfig` mirror. Accruals look up the version active on the lesson date so a rate change applies forward, not retroactively.

- `effectiveFrom` (DateTime, mandatory in DTO; defaults to today @ 00:00 Tashkent).
- Reject going backwards: `effectiveFrom < latestVersion.effectiveFrom` → 400.
- Reject inside a closed period: `effectiveFrom` inside an APPROVED/PAID `SalaryPayment` window → 400.
- Lookup: two-query pattern (per-group first, then global) — Postgres NULL ordering with `groupId DESC` is not contractual, so the resolver explicitly tries `groupId = X` then falls back to `groupId IS NULL`.
- `salary-summary.service.ts` and `salary-calculation.service.ts` both use the version table; `FIXED_MONTHLY` payroll reads the version active at `periodEnd`, not the parent mirror, so a future-dated rate change does NOT affect the current cycle.

##### `FIXED_PER_STUDENT` semantics (audit fix)

Value is per-student-per-cycle, NOT per-lesson. Per-lesson amount in `createAccrual` and `salary-summary` is `Math.round(value / lessonPaymentCount)`. The previous bug wrote the full `value` per lesson, inflating teacher pay by `lessonPaymentCount × `.

#### Period bounds are column-type aware (`PeriodBounds`)

`computePeriodBounds` returns **two** pairs, and picking the wrong one silently double-counts a day:

| Pair                                                                         | Use with           | Columns                                                                                                           |
| ---------------------------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `periodStart` / `periodEnd` (Tashkent-shifted instants, `lte`)               | TIMESTAMP columns  | `SalaryAccrual.creditPeriodDate`, `SalaryPayment.periodStart/End`, `EmployeeSalaryConfigVersion.effectiveFrom/To` |
| `periodStartDate` / `periodEndDateExclusive` (unshifted UTC dates, **`lt`**) | `@db.Date` columns | `SalaryAccrual.lessonDate`, `Attendance.date`, `Expense.date`                                                     |

**Why:** Postgres compares a `date` column against a timestamp by truncating the timestamp to its UTC calendar date. The Tashkent-shifted start of July is `2026-06-30T19:00:00Z`, which truncates to **2026-06-30** — so `lessonDate >= periodStart` swept the last day of June into July, and that day counted in **both** periods. Measured on production: July's salary figure was inflated by **1 819 343 so'm**, and the error flowed into the Foyda card, the Excel «Sof foyda» sheet and the Telegram daily report. Fixing the bounds dropped the July figure from 90 824 433 to 89 005 090.

The upper date bound is **exclusive** on purpose: `lte …T18:59:59.999Z` truncates to the period's last day and would include it twice over.

Note that 30.06 lessons can still legitimately appear in July via `creditPeriodDate` — that is the carry-over feature (a late payment credited to the open period), not the boundary defect. `scripts/audit-boundary-probe.ts` checks the boundary; `scripts/audit-july-clean.ts` predates the fix and its «ORTIQCHA» line no longer measures double counting.

#### Salary Period (`SalaryPeriodSetting`)

Per-company configurable cycle start day (default 8). Replaces the previously-hardcoded `8 → 7` window.

- `cycleStartDay`: 1–28 (capped to 28 to dodge the February edge case).
- `effectiveFrom` / `effectiveTo` SCD2.
- **Mid-cycle cutover policy**: if a CEO sets `effectiveFrom` inside the currently-running cycle (under the old `cycleStartDay`), the service auto-shifts `effectiveFrom` to the start of the next cycle on the OLD schedule. The current cycle always closes on its original schedule.
- `resolveCurrentPeriod(companyId, now)` (in `src/salary/shared/resolve-current-period.ts`) returns `{periodStart, periodEnd, cycleStartDay}` for `now`.
- Cron is now `0 2 * * *` (daily 02:00 Tashkent); each company-tick checks `isCycleStartDayForCompany` before triggering calculation.

#### Lesson Cancellation (`src/lesson-cancellations/`)

Per-group lesson cancellation distinct from `Holiday` (company-wide).

- Schema: `LessonCancellation { groupId, date, reason, cancelledById, deletedAt? }`. Partial unique index `WHERE deletedAt IS NULL` so soft-delete doesn't block re-creation.
- `Attendance.cancellationId` (nullable FK) — set by the cascade when an existing attendance is rolled into a cancellation. `AttendanceStatus` enum is **not** extended (existing biller/stat queries unaffected); the link itself plus `status = EXCUSED` are the cancellation marker.
- `attendance-validation.service.ts` rejects writes for cancelled `(groupId, date)`.
- `LessonCancellationsService.create()` is atomic (`Serializable`):
  1. Insert `LessonCancellation` row.
  2. Find PRESENT/LATE attendances for `(groupId, date)`.
  3. For each: flip status to EXCUSED, set `cancellationId`, run `lessonBillingService.processAttendanceBilling(tx, oldStatus=PRESENT, newStatus=EXCUSED)` — which reverses consumption + accrual + restores prepaid (only when consumption existed).
- `DELETE /lesson-cancellations/:id` is **soft** — it does NOT auto-restore attendance/billing. Admins must re-take attendance manually. UI explains this in the confirm dialog.
- Teacher scope: `GET /lesson-cancellations` requires `groupId`; teacher role is additionally constrained to groups they teach (returns `[]` for unauthorised groups instead of leaking 403/404).

#### Initial Balance (`POST /students/:id/initial-balance`)

CEO-only one-shot for centers transitioning to the new finance system. Writes a single `INITIAL_BALANCE` Transaction; the partial unique index enforces "at most one per student". P2002 is translated to `BadRequestException("Boshlang'ich balans bu o'quvchi uchun allaqachon kiritilgan")`.

#### Balance Withdrawal (`src/withdrawals/`)

Admin-driven drain of a student's positive balance into the system as recognized revenue for a chosen accounting month — distinct from `Refunds`, which return money to the student. Used during onboarding/transition when a student paid in advance, the teacher took attendance for a few cycles, and the rest of the balance must still be recognised manually rather than left "muallaq" (floating).

- **Endpoints**: `GET /withdrawals/preview/:studentId`, `POST /withdrawals`
- **Roles**: `CEO, Branch Director, Administrator` (class-level `@Roles`)
- **Transaction type**: `BALANCE_WITHDRAWAL` — reduces student balance, metadata stores `{ targetMonth, creditTeacher, teacherUserId, groupId, reason }` for audit
- **`creditTeacher` flag**: when true, also writes a `SalaryAccrual` linked via `deductionTransactionId` to the new BALANCE_WITHDRAWAL row. The accrual has `attendanceId IS NULL` (no underlying lesson) and `lessonDate = first of targetMonth`. The teacher must be on one of the student's active enrollments — service validates this via a `groupTeachers` join and throws `ForbiddenException` otherwise.
- **`SalaryAccrual` schema relax**: `attendanceId` is nullable; the previous unique constraint `(userId, studentId, groupId, lessonDate)` is replaced with `(userId, studentId, groupId, lessonDate, attendanceId)` so withdrawal accruals (NULL attendanceId) can stack within a month — Postgres treats NULLs as distinct in UNIQUE.
- **Atomicity**: balance check + transaction write + student balance update + optional accrual + EntityHistory record run inside one `Serializable` `prisma.$transaction` (10s maxWait, 15s timeout).
- **`To'lovlar` tab**: `BALANCE_WITHDRAWAL` is a money-flow type — included in the comma-separated `?types=` filter. That list is the tab's contract: **every type that moves the balance belongs in it** (`PAYMENT,REFUND,ADJUSTMENT,INITIAL_BALANCE,BALANCE_WITHDRAWAL,LESSON_DEDUCTION,DISCOUNT_ADJUSTMENT,DEBT_WRITE_OFF,MOCK_EXAM_FEE`) — a missing type shows the balance jumping with no visible cause, which is what hid 37 rows worth 4 296 450 so'm. Adding a new balance-moving `TransactionType` means adding it here AND to `TRANSACTION_TYPE_INFO` on the client. The `Lesson Trail` endpoint continues to scope strictly to `LESSON_DEDUCTION` + `LESSON_CONSUMPTION`.
- **Salary calculation**: existing `salary-summary` and `salary-calculation` queries pick up withdrawal accruals automatically (filter is `salaryPaymentId: null, reversedAt: null` + `lessonDate` range), so no special-case logic. The `lessonDate = YYYY-MM-01` date determines which salary cycle the accrual lands in based on each company's `cycleStartDay`.

#### "Where did this payment go?" — replay the ledger, never re-derive it

`common/finance/ledger-replay.ts` is the ONE engine behind the payment card on the student "To'lovlar" tab. It exists because the previous `computePaymentDestination` kept its own FIFO queue of payments and funded only the deductions that came AFTER each one. A lesson taken on credit hit an empty queue, fell through the loop, and no later payment ever covered it — so money that had already cleared that debt was reported as "remainderInBalance". **540 of 569 students showed a wrong card**, and one read theirs as "I have 233 339 so'm" while sitting at −33 325.

The answer was already in the database. Every student-scoped row stores `balanceBefore` / `balanceAfter` under `lockStudent`'s `SELECT … FOR UPDATE`, and a production audit found **0 violations of `balanceAfter − balanceBefore === amount` across 39 516 rows** (except `EXPENSE`, which hardcodes 0/0 and is not student-scoped). A reporting layer that recomputes that from `amount` alone is rebuilding a truth it could read.

Four rules, each load-bearing — do not relax them one at a time:

- **Every balance-moving row is in the walk.** `where: { studentId, companyId, amount: { not: 0 } }` — no type list. `ADJUSTMENT` alone was 316 rows across 254 students the old walk could not see; `DISCOUNT_ADJUSTMENT`, `DEBT_WRITE_OFF`, `MOCK_EXAM_FEE` add 37 more. `amount: { not: 0 }` drops only `LESSON_CONSUMPTION`, the one row type written without a balance lock.
- **NO reversal filter.** `reverseTransaction` writes the counter-row with `type: original.type` and `reversedAt: null`, so filtering `reversedAt: null` keeps the undo and drops the original. Include both and the pair nets to zero: **0 chain breaks over 28 950 production rows, versus 99 when the original is filtered out.** This is the opposite of `lesson-coverage.helper.ts`, which counts LESSONS rather than money and therefore excludes **both** halves (`reversedAt: null AND reversedTransactionId: null`). Same for `getBalanceSummary` — a summary answers "what stands today".
- **Signed amounts, never `Math.abs`.** `amount > 0` credits, `< 0` debits. `Math.abs` turned those positive counter-rows into fresh lesson charges (124 rows, 4 572 301 so'm, 65 students) in both the card and `getBalanceSummary`.
- **FAIL-CLOSED.** If the replayed chain ever disagrees with the stored balances, `reconciled: false` comes back and the UI renders the balance facts only. The defect being replaced was a plausible-looking wrong number; a patched-up number would re-legitimise it.

Money is allocated at **per-lesson slice** granularity (`splitLessonSlices` + `CycleCoverage.consumedDates`), not per deduction batch — otherwise a payment funding part of a 5-lesson batch inherits the whole batch's date range (#10460's 21.07 card read "21.07 — 04.08" instead of "21.07 — 30.07").

A lesson deduction is **all-or-nothing**: `lesson-billing.service.ts` never bills more than the balance in `FULL_CYCLE`/`PARTIAL`, and in `SINGLE_UNCOVERED` it bills the full lesson and drives the balance negative. So `|amount| > balanceBefore` means the lesson is entirely unpaid. Every OTHER debit type (`REFUND`, `BALANCE_WITHDRAWAL`, …) funds partially, exactly as the stored balance shows.

Invariants, and the one that is impossible: **`Σ remainder === Student.balance` cannot hold** — a negative balance is not a sum of non-negative remainders. The real one is `Σ unspent − Σ outstandingDebt === Student.balance`. Guard: `scripts/audit-payment-destination.ts` (read-only, exits non-zero on any violation; **684/684 students clean**). `scripts/show-payment-cards.ts` prints one student's cards as the UI renders them.

**The card's vocabulary is part of the fix.** `remainderInBalance` is gone and must not come back under any name that claims a holding: it is what let a student read "233 339 qoldi" while owing money. The field is `unspent`, rendered as "Sarflanmagan qoldiq", never green while the balance is negative, with today's real balance on the latest payment card.

Deliberately NOT merged into this engine: `getIncomeMonthAttribution` (`reports-financial.service.ts`). It filters reversals on purpose — it reports _corrected_ history, while the card reports what the admin actually saw that day. Two questions, two engines, each documented; a shared flag would hide the difference.

#### Lesson Trail (`GET /transactions/student/:id/lesson-trail`)

Per-student "where did each so'm go for lessons?" report. Strictly scoped to `LESSON_DEDUCTION` (prepaid-batch allocation rows) and `LESSON_CONSUMPTION` (per-lesson use rows) — money-flow types (PAYMENT/REFUND/ADJUSTMENT/INITIAL_BALANCE) are filtered out at the service level. Paginated (`page`, `pageSize`). Returns rows in ASC order (chronological story) enriched with attendance metadata (date, group, course) and reversal markers. Drives the "Darslar" tab (URL `?tab=darslar`) on the student profile.

#### Student transactions list (`GET /transactions/student/:id`)

Used by the "To'lovlar" tab. Accepts a `types` query parameter — a comma-separated list of `TransactionType` values (e.g. `?types=PAYMENT,REFUND,ADJUSTMENT,INITIAL_BALANCE,BALANCE_WITHDRAWAL,LESSON_DEDUCTION`) — so the tab can request only the rows that move the balance. Validated against the enum at the DTO boundary; invalid tokens reject. The legacy single-`type` parameter still works as a fallback for one type.

**Tab overlap on `LESSON_DEDUCTION` (intentional).** `LESSON_DEDUCTION` is a real money-flow row — it decreases the student balance — so it appears on **both** the "To'lovlar" tab (so a balance drop is never unexplained, e.g. a payment immediately consumed by retroactive billing) **and** the "Darslar" tab (where it shows which prepaid batch covered which lessons). It is the **one** `TransactionType` deliberately shared between the two tabs. `LESSON_CONSUMPTION` (amount=0, no balance movement) stays exclusive to the "Darslar" tab. Every other type belongs to exactly one tab.

#### Enrollment Lifecycle Prepaid Refund (`EnrollmentBillingService`)

When an enrollment closes (TRANSFERRED or DROPPED), unused prepaid lessons are converted back to balance. **Original** `perLessonCost` (from the most recent unreversed `LESSON_DEDUCTION.metadata.perLessonCost`) is used so course price changes after the deduction don't affect the refund. Falls back to the current course price for legacy rows without metadata.

- `removeFromGroup()`: refund + flip to DROPPED in one tx.
- Transfer (`enrollToGroup` with existing enrollment): refund old enrollment + close TRANSFERRED + create new enrollment + state log — all in a single Serializable transaction so we never end up with prepaid stranded on a closed enrollment.

#### Payment Reverse Block

`payments-write.service.ts:reverse()` refuses if any non-reversed `LESSON_CONSUMPTION` exists for the student dated AFTER the payment landed. The funds are already spent on lessons — admins must use the formal `Refund` flow (which has proper math for partial completion + deductions). Force-reverse is intentionally not provided to prevent ledger drift.

#### Payment Amount Correction

`payments-write.service.ts:correctAmount()` (`POST /payments/:id/correct`) fixes a wrong amount on a manual payment (e.g. cashier typed 4 000 000 instead of 400 000). It is **reverse + re-post**, not an in-place edit — the append-only ledger rule holds. The original payment becomes `REVERSED`; a fresh payment is created at the correct amount. The two steps run as separate Serializable transactions (not one atomic unit); if the re-post fails, a precise recovery message is surfaced.

- **Roles**: CEO, BD, Admin (`@Roles` on the endpoint excludes Cashier).
- It also fixes a wrong **payment method** (`method` optional in `CorrectPaymentDto` — when omitted the original method is kept). Amount and method can be corrected together or independently.
- **Method-only correction is an in-place update, NOT reverse + re-post.** When the amount is unchanged (only the method differs), the balance never moves, so `correctAmount()` early-returns after a single Serializable tx that just updates `Payment.method` (+ `recordUpdate` audit + CEO alert). The ledger (`Transaction`) stores balances, not the method, so no ledger row changes. **Consequence:** the "funds already spent on lessons" guard does NOT apply to a method-only fix — a mis-recorded method (e.g. CASH → TRANSFER) can be relabelled even after the money was consumed by lessons. The reverse+re-post path (and its consumption guard) is reached only when the **amount** changes.
- **Guardrails** (all enforced in the service): only `ADMIN_MANUAL` source (gateway amounts are provider-owned); only `COMPLETED` status; amount and/or method must differ; non-CEO callers bound to a **72h window** after the payment landed (`ADMIN_CORRECTION_WINDOW_HOURS`, CEOs bypass); **on an amount change** blocked when funds were already spent on lessons (`LESSON_CONSUMPTION` exists) — that needs the CEO lesson-deduction unwind flow.
- A `reason` is **mandatory only when the amount changes** (an amount fix must be explained in the audit trail). A **method-only** correction (money unchanged, e.g. CASH → TRANSFER) needs no reason — the service enforces this. When given, the reason lands in the audit trail and the re-posted payment's `note` records the previous amount + reason.
- **Student notifications**: two Telegram messages — `payment.reversed` (old payment rolled back) then `payment.received` (new payment posted).
- **CEO alert**: when a non-CEO performs the correction, `payment.corrected` is emitted → `NotificationEventsListener` notifies all company CEOs (DB + SSE + Push + Telegram, `NotificationType.SYSTEM`).

#### Status Transitions (centralized in `src/common/finance/status-transitions.ts`)

- `assertValidTransition(entityType, map, fromStatus, toStatus)` — throws `BadRequestException` if invalid
- Used across: payments (reverse), refunds (process), salary (approve/pay), contracts (status change)

#### RBAC for Financial Features

| Feature                                          | CEO | BD  | Admin | Cashier | Teacher |
| ------------------------------------------------ | :-: | :-: | :---: | :-----: | :-----: |
| Create payment                                   | ✅  | ✅  |  ✅   |   ✅    |   ❌    |
| Reverse payment                                  | ✅  | ❌  |  ❌   |   ❌    |   ❌    |
| Correct payment amount                           | ✅  | ✅  |  ✅   |   ❌    |   ❌    |
| Salary config                                    | ✅  | ✅  |  ❌   |   ❌    |   ❌    |
| Calculate salary                                 | ✅  | ❌  |  ❌   |   ❌    |   ❌    |
| Approve salary                                   | ✅  | ❌  |  ❌   |   ❌    |   ❌    |
| Pay salary                                       | ✅  | ✅  |  ❌   |   ❌    |   ❌    |
| Create refund                                    | ✅  | ✅  |  ✅   |   ❌    |   ❌    |
| Reverse refund                                   | ✅  | ❌  |  ❌   |   ❌    |   ❌    |
| Create expense                                   | ✅  | ✅  |  ❌   |   ❌    |   ❌    |
| Financial reports                                | ✅  | ✅  |  ❌   |   ❌    |   ❌    |
| Debt page reads (history, aging, write-off list) | ✅  | ✅  |  ✅   |   ✅    |   ❌    |

### Comments & Task Assignment

- `CommentsModule` (`src/comments/`) — comments and task assignment system
- **Comment** table: polymorphic `entityType`/`entityId` (same pattern as EntityHistory)
- **CommentAssignee** table: users assigned to a task, each with their own status (PENDING → SEEN → DONE)
- **Permissions**: Regular comments — CEO, BD, Admin. Task comments — CEO, BD, and Admin. Administrator was added to the task-creation gate so the /outreach (Aloqa markazi) workflow is usable for the role that actually runs it day-to-day.
- **Endpoints:**
  - `POST /api/comments` — create comment/task
  - `GET /api/comments?entityType=Student&entityId=12345&page=1&pageSize=20` — list by entity
  - `GET /api/comments/latest?entityType=Student&entityId=12345` — latest comment (for Eslatma/reminder section)
  - `DELETE /api/comments/:id` — author or CEO can delete
  - `PATCH /api/comments/:id/assignee-status` — assigned user updates their own status
- Comment creation/deletion is recorded in the audit log via `EntityHistoryService`
- Events are emitted via `@nestjs/event-emitter`: `comment.created`, `task.assigned`, `task.status.changed`
- `TaskReminderService` cron sends "deadline approaching" notifications 1h before `dueDate`. Runs once per hour on the hour, only during business hours and on working days (`'0 0 8-18 * * 1-6'`, Asia/Tashkent — fires at 08:00, 09:00, …, 18:00 Monday–Saturday). Sundays and active holidays (via `HolidaysService.findActiveHolidayCovering`) are skipped. The DB autosuspends outside this window. **Task dueDate is enforced to fall inside this same window** — `CommentsService.create` and `update` reject any `isTask=true` task with `dueDate` outside 08:00–18:00 Tashkent or on a Sunday with `BadRequestException`, so every task reminder is guaranteed a cron tick within 1h of its deadline.

### Notifications (4 channels)

- `NotificationsModule` (`src/notifications/`) — notification system
- **Notification** table: per-user notifications (userId, type, title, message, isRead)
- **PushSubscription** table: browser push subscription data
- **4 delivery channels:**
  1. **DB** — all notifications are persisted
  2. **SSE (Server-Sent Events)** — real-time, `GET /api/notifications/stream` (fetch-based, with JWT Authorization header)
  3. **Web Push** — works even when browser is closed, via `web-push` library and VAPID keys
  4. **Telegram** — via `TelegramService.getBot().telegram.sendMessage()`, only if user has `telegramChatId`
- **SSE Gateway** (`notifications.gateway.ts`): userId → Response mapping, 30s heartbeat
- **Event Listener** (`notification-events.listener.ts`): fans out events to all 4 channels
- **Endpoints:**
  - `GET /api/notifications?page=1&pageSize=20` — current user's notifications
  - `GET /api/notifications/unread-count` — unread count for badge
  - `PATCH /api/notifications/:id/read` — mark as read
  - `PATCH /api/notifications/read-all` — mark all as read
  - `GET /api/notifications/stream` — SSE stream
  - `POST /api/notifications/push/subscribe` — push subscription
  - `DELETE /api/notifications/push/unsubscribe` — push unsubscribe
  - `GET /api/notifications/vapid-public-key` — VAPID public key

### Student Search & Filters

- **Unified search** (`?search=`): searches across `firstName`, `lastName`, `phone`, and `id` (numeric) in a single query — the frontend sends one search string for all fields
- **Status filters** (`?status=`): `active`, `frozen`, `ungrouped`, `graduated`, `expelled` — each maps to specific `where` conditions in the service
- **Branch filter** (`?branch_id=`): filters students by their enrollment branch
- `ungrouped` = active students with zero enrollments
- `graduated` and `expelled` map directly to `StudentStatus.GRADUATED` and `StudentStatus.EXPELLED`

### Error Handling

- Use NestJS built-in exceptions (`NotFoundException`, `ForbiddenException`, `BadRequestException`, etc.)
- Never expose internal error details to clients

### File Size and Responsibility

- **One file = one responsibility** (Single Responsibility Principle)
- Components: **100–300 lines** target
- **500 lines is the limit for NEW files, not a claim about existing ones.**
  46 service/util files and 28 spec files are already over it, the largest at
  1742 (`reports/reports-financial.service.ts`). Written as a "hard maximum"
  it read as a description of the codebase, which made it easy to assume a
  long file must be somebody else's problem. It is a rule for what you add:
  do not create a new file above 500 lines, and do not push an existing one
  further past it.
- If a file grows too large — split into smaller, focused parts

### Lazy Data Loading for Tabs

- When the frontend uses tabs (e.g. profile pages with "Profil", "Guruhlar", "Ish haqi"), each tab's data is fetched **only when the user switches to that tab** — not all at once on page load
- Design API endpoints for tab-specific data as **separate routes** (e.g. `GET /api/teachers/:id/groups`) rather than embedding everything in the main entity response
- This keeps the main entity endpoint fast and avoids loading data the user may never need

### User Status & isActive Synchronization

The `User` model has two related fields: `isActive: Boolean` and `status: UserStatus` (`ACTIVE | INACTIVE | SUSPENDED | TERMINATED | ARCHIVED`). They **must** stay in sync: `isActive === (status === UserStatus.ACTIVE)`.

- **All code that updates `User.status` must also set `isActive` accordingly.** `UsersService.updateUser()` and `TeachersService.changeStatus()` already do this — follow the same pattern (`isActive = dto.status === UserStatus.ACTIVE`) when adding new status mutation paths
- **Never write a DTO that exposes `isActive` directly** — it is a derived field. Callers pass `status`; the service derives `isActive`
- When archiving (soft delete), force both: `status: UserStatus.ARCHIVED, isActive: false, deletedAt: <now>`
- When restoring from archive, force both: `status: UserStatus.ACTIVE, isActive: true, deletedAt: null`
- Backfill script: `server/scripts/backfill-user-isactive.ts` (supports `--dry-run`) — run after any schema migration that may introduce drift
- **Downstream queries should still filter by both fields** (see "Recipient filter" rule above) — do not rely solely on the sync invariant, because a bug in a future mutation path could break it silently

### Future-Proof Design

- **Every backend change must anticipate future use cases** — do not write code that only solves the immediate problem. Consider what related features, status changes, cascade effects, or edge cases may arise and design the solution to handle them naturally
- **Status changes must cascade correctly** — when an entity's status changes, all dependent entities must be updated accordingly, and history must be recorded for every affected entity. Never add a status without defining its full cascade behavior
- **Validation must be comprehensive** — when adding a new operation, validate all preconditions rather than assuming the caller will only send valid data
- **Think in entity relationships** — a change to a Student affects Enrollments, which affect Groups. A change to a Group affects Enrollments, which affect Students. Always trace the full chain of effects and ensure each link is handled

### Code Organization

- Shared utilities go in `src/common/`
- Custom decorators in `src/common/decorators/`
- Guards in `src/common/guards/`
- Shared DTOs in `src/common/dto/`
- Domain modules in `src/<domain>/` (e.g., `src/branches/`, `src/students/`)

### Testing

- **Every change must be tested before the work is considered complete.** No exceptions — untested code is unfinished code.
- After adding or modifying a service, write unit tests before considering the work done
- **Controller guard tests are mandatory** — when adding or modifying `@Roles()` guards on controller endpoints, write `*.controller.spec.ts` tests that verify the role metadata exists and that `RolesGuard` allows/denies the correct roles (see existing controller spec files for the pattern)
- Test files live next to the code they test: `<service>.spec.ts`, `<controller>.spec.ts` (e.g., `comments.service.spec.ts`, `branches.controller.spec.ts`)
- Use `@nestjs/testing` `Test.createTestingModule()` with all dependencies mocked as plain objects (`{ provide: Service, useValue: mockObject }`)
- Mock `PrismaService` per-model: `prisma = { student: { findFirst: jest.fn(), ... }, ... }`
- Mock `EntityHistoryService` with all 5 methods: `recordCreate`, `recordUpdate`, `recordDelete`, `recordStatusChange`, `recordRestore`
- Mock `EventEmitter2` with `{ emit: jest.fn() }`
- Use `jest.fn().mockResolvedValue()` for async returns
- Use `expect.objectContaining()` for partial matching
- Test both success paths **and** error paths (NotFoundException, ForbiddenException, BadRequestException)
- Run tests: `npm test` (all), `npx jest <path>` (specific file)
- **Always run the full test suite (`npm test`) after finishing changes** to verify nothing is broken — all tests must pass before the work is considered complete
- **Green tests do not mean the types are right.** `ts-jest` runs with
  `isolatedModules`, i.e. transpile-only: a spec can mock a signature that no
  longer exists and still pass. `npm run typecheck` (`tsconfig.check.json`) is
  what type-checks `src/` INCLUDING specs — `npm run build` cannot, its
  tsconfig excludes them. Run both.
- **Lint is a gate, not a suggestion.** CI runs `npx eslint src` on both
  workspaces and fails on ERRORS (warnings are reported and do not block —
  the `no-unsafe-*` family fires on every Prisma JSON field here, ~9,900
  times, none of them defects). The error set is triaged to zero; keep it
  there. Formatting is Prettier's, enforced through ESLint — run
  `npx prettier --write` on files you touch.

## Commands

- `npm run start:dev` — Development with hot reload
- `npm run build` — Build for production
- `npm run start:prod` — Run production build
- `npx prisma migrate dev` — Run database migrations
- `npx prisma migrate dev --name <name>` — Create new migration
- `npx prisma studio` — Open Prisma Studio (DB GUI)
- `npx prisma generate` — Regenerate Prisma Client
- `npm run db:migrate:deploy` — Apply pending migrations (production)
- `npm run db:seed` — Seed database with initial data
- `docker compose up -d` — Start PostgreSQL + Redis (from project root)
- `docker compose down` — Stop containers

### CLAUDE.md Language Policy

- **This file (CLAUDE.md) must be written entirely in English.** All section headings, descriptions, rules, and comments must use English only.
- Uzbek text is acceptable **only** when quoting exact UI strings, error messages, or API response messages that appear in the application.
- When adding new sections or editing existing ones, always write in English.
- **This rule governs this file alone.** It is not a rule about the codebase:
  ADRs under `docs/adr/` are written in Uzbek by design, and code comments use
  whichever language explains the thing best — often Uzbek where the subject is
  a domain term the business uses in Uzbek.

## Available Skills

Skills are specialized knowledge modules that **must** be activated when working on related tasks. Before starting any task, identify which skills are relevant and invoke them.

### Slash Commands (`.claude/commands/`)

| Command        | When to use                             |
| -------------- | --------------------------------------- |
| `/deploy`      | Deploy to Vercel + Railway + Auto-Merge |
| `/restart`     | Restart dev servers                     |
| `/team-deploy` | Safe team deployment                    |
| `/team-merge`  | Safe PR merge                           |

### Context7 Skills (auto-triggered)

| Skill                   | When to use                                                |
| ----------------------- | ---------------------------------------------------------- |
| `nestjs-best-practices` | NestJS module, DI, security, architecture patterns         |
| `typescript-expert`     | TypeScript type-level programming, performance, migration  |
| `prisma-cli`            | Prisma CLI: migrate, generate, seed, studio                |
| `prisma-client-api`     | Prisma query, filter, CRUD, client configuration           |
| `prisma-database-setup` | Prisma + PostgreSQL/MySQL/SQLite connection and setup      |
| `prisma-postgres`       | Prisma Postgres provisioning and management                |
| `docker-expert`         | Docker containerization, multi-stage builds, orchestration |
| `redis-development`     | Redis data structures, performance, caching                |
| `use-railway`           | Railway deploy, services, databases, domains               |

### Agent Skills (`.agents/skills/`)

| Skill                  | When to use                                             |
| ---------------------- | ------------------------------------------------------- |
| `telegram-bot-builder` | Telegram bot development, scenes, handlers, middlewares |
| `documentation-writer` | Writing technical documentation                         |

### Skill Usage Rule

**Identify and activate the relevant skill at the start of each task — this is mandatory, not optional:**

1. **NestJS module/service/controller** → `nestjs-best-practices`
2. **Prisma schema, migration** → `prisma-cli` + `prisma-database-setup`
3. **Writing Prisma queries** → `prisma-client-api`
4. **TypeScript errors or complex types** → `typescript-expert`
5. **Docker setup** → `docker-expert`
6. **Redis caching** → `redis-development`
7. **Deploying** → `/deploy` or `use-railway`
8. **Writing tests** → `nestjs-best-practices` (testing patterns)
9. **Telegram bot (scenes, handlers, webhooks)** → `telegram-bot-builder`

### Unused but Available Modules

- **AiModule** (`src/ai/`) — fully implemented OpenAI integration (chat completion + streaming), registered as `@Global()` but not yet exposed via controller or injected anywhere. Ready for future AI features.

## Environment Variables

| Variable                                   | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Default                      |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `DATABASE_URL`                             | PostgreSQL connection string                                                                                                                                                                                                                                                                                                                                                                                                                                           | —                            |
| `JWT_SECRET`                               | Secret for JWT signing                                                                                                                                                                                                                                                                                                                                                                                                                                                 | —                            |
| `REDIS_HOST`                               | Redis host                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `localhost`                  |
| `REDIS_PORT`                               | Redis port                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `6379`                       |
| `PORT`                                     | Server port                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `4000`                       |
| `NODE_ENV`                                 | Environment                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `development`                |
| `VAPID_PUBLIC_KEY`                         | Web Push VAPID public key                                                                                                                                                                                                                                                                                                                                                                                                                                              | —                            |
| `VAPID_PRIVATE_KEY`                        | Web Push VAPID private key                                                                                                                                                                                                                                                                                                                                                                                                                                             | —                            |
| `VAPID_EMAIL`                              | VAPID contact email                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `mailto:admin@dafzentrum.uz` |
| `PAYME_MERCHANT_ID`                        | Paycom merchant/kassa ID                                                                                                                                                                                                                                                                                                                                                                                                                                               | —                            |
| `PAYME_MERCHANT_KEY`                       | Paycom production secret key                                                                                                                                                                                                                                                                                                                                                                                                                                           | —                            |
| `PAYME_MERCHANT_KEY_TEST`                  | Paycom test/sandbox secret key                                                                                                                                                                                                                                                                                                                                                                                                                                         | —                            |
| `CLICK_MERCHANT_ID`                        | Click merchant ID                                                                                                                                                                                                                                                                                                                                                                                                                                                      | —                            |
| `CLICK_SERVICE_ID`                         | Click service ID                                                                                                                                                                                                                                                                                                                                                                                                                                                       | —                            |
| `CLICK_SECRET_KEY`                         | Click secret key for MD5 signature verification                                                                                                                                                                                                                                                                                                                                                                                                                        | —                            |
| `STUDENT_ATTENDANCE_NOTIFICATIONS_ENABLED` | Gate for per-student attendance Telegram messages (`'true'` to enable)                                                                                                                                                                                                                                                                                                                                                                                                 | _disabled_                   |
| `CRONS_ENABLED`                            | Set to `'false'` to skip `ScheduleModule.forRoot()`. Default (unset) = crons RUN, so production is unaffected. Exists so a LOCAL server can be pointed at the production database without its schedule firing — otherwise the laptop sends attendance reminders to real teachers every 30 min, writes the 23:40 snapshot and runs the 02:00 payroll. Blank `TELEGRAM_BOT_TOKEN=` / `TELEGRAM_ADMIN_BOT_TOKEN=` alongside it, or the local process polls the real bots. | _crons on_                   |
| `TELEGRAM_OAUTH_CLIENT_ID`                 | Telegram OIDC client id (BotFather → Login Widget)                                                                                                                                                                                                                                                                                                                                                                                                                     | —                            |
| `TELEGRAM_OAUTH_CLIENT_SECRET`             | Telegram OIDC client secret                                                                                                                                                                                                                                                                                                                                                                                                                                            | —                            |
| `TELEGRAM_OAUTH_REDIRECT_URI`              | Must byte-match a BotFather Redirect URI                                                                                                                                                                                                                                                                                                                                                                                                                               | —                            |
