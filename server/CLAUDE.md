@AGENTS.md

# DaF Sprachzentrum — ERP System (Backend)

An ERP system for **DaF Sprachzentrum** language school. Backend API serving the frontend client.

> **Domain terms live in [`CONTEXT.md`](../CONTEXT.md)**, at the repo root: what
> a word MEANS, plus the file that defines it. This file is about HOW to work;
> `docs/adr/` is about WHY a decision was made. When a definition here and one
> there disagree, the code wins and both should be corrected.

> **Roles:** CEO, Branch Director, Administrator, Teacher, Cashier. The system supports **multiple branches** (filials).
> Roles are stored in a `Role` table with fixed IDs (1–6: CEO=1, Branch Director=2, Administrator=3, Teacher=4, Cashier=5, **Student=6**), linked to users via `UserRole` join table (many-to-many). The Student role id is exposed as `STUDENT_ROLE_ID` constant in `src/students/shared/student-select.ts`.

## Architecture decisions (ADR)

**`docs/adr/` is the log of decisions that are hard to reverse.** Before changing
code, check the index in [docs/adr/README.md](../docs/adr/README.md): if the code
you are touching is covered by an ADR, that ADR is a **binding rule** — the code
adapts to it, not the other way round.

The index is the only list of ADRs. This file deliberately does not repeat it,
because a copy here falls behind the log.

**When a new ADR is written:** when the data model, money semantics, a branch
rule, a fail-open/fail-closed choice or an external-service choice changes — the
ADR goes **in the same PR as the work itself**. An accepted ADR is never edited;
when it goes stale, a new ADR is written and the old one's status becomes
`Almashtirildi` (superseded). Details: [docs/adr/README.md](../docs/adr/README.md).

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

### Day boundaries (`src/common/date/tashkent.ts`)

The center is in Asia/Tashkent (UTC+5, no DST) and every timestamp column stores a UTC instant. A day a user picks in a filter is a **Tashkent** day, and `new Date('2026-08-05')` is 00:00 **UTC** — 05:00 Tashkent. Build every bound through `common/date/tashkent`, never by hand. The same goes for "which month or day is it now": `tashkentMonthKey(new Date())` / `tashkentDateStr(new Date())`, never `getFullYear()` / `getMonth()` (the PROCESS timezone, UTC on Railway) or `toISOString().slice(…)` (UTC) — both still say yesterday, or last month, from 00:00 to 05:00 Tashkent.

| Column type | Examples                                                            | Helper                                                             |
| ----------- | ------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `timestamp` | `Payment.createdAt`, `Enrollment.statusChangedAt`, `Lead.createdAt` | `tashkentRangeUtc`, `tashkentRangeFilter`, `tashkentMonthRangeUtc` |
| `@db.Date`  | `Attendance.date`, `Expense.date`, `SalaryAccrual.lessonDate`       | `utcMidnightFromDateStr`                                           |

Upper bounds are **exclusive** (`lt`), never `lte` — adjacent days then leave no gap and no overlap.

**Banned, and enforced by `common/date/tashkent.single-source.spec.ts` (build fails):** `setHours(23, 59, 59, …)` (reads the PROCESS timezone), the `'T23:59:59.999Z'` literal (04:59 next morning in Tashkent), `new Date(query.startDate)` for a range bound, and mixing a timestamp bound with a `@db.Date` bound in one filter.

**Why it matters:** a Click payment at `2026-08-05T19:18:44Z` is 06.08 00:18 in Tashkent and the student's receipt says 06.08 — the report listed it under 05.08. The `@db.Date` half of the same mistake once inflated a month of teacher salary by 1 819 343 so'm (ADR-0006, ADR-0016).

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

#### Multi-value filter parameters

List filters are multi-select on the client, so a query parameter that filters a
list accepts **several comma-separated values** (`?level=A1,A2`, `?user_type=CEO,Teacher`).
One shared helper parses them — `src/common/dto/to-array.ts` — and no DTO writes
its own copy (two hand-rolled `toArray` functions had already drifted apart
before it existed).

- `toStringArray` / `toNumberArray` in a `@Transform`, then `@IsArray()` +
  `@IsEnum(..., { each: true })` (or `@IsString`/`@IsInt` with `each`). A single
  value still arrives as a one-element array, so an old link keeps working.
- **Empty parses to `undefined`, never `[]`.** `[]` means "match nothing" and
  `in: []` would silently return an empty list; the absence of a filter means
  "everything". Never let a blank or junk parameter collapse into `in: []`.
- Build the `where` with `equalsOrIn(values)`: one value becomes `equals` (clearer
  plan, uses the existing index), several become `in`.
- A filter whose options are **composite predicates** — one option is a whole
  `where` fragment, not a column value (mock-exam `paidStatus`, student `status`)
  — cannot use `in`. OR the fragments together and nest that OR under `AND`,
  because free-text search usually already owns `where.OR`.
- A filter whose single option maps to **several parameters** across dimensions
  (leads `holati`, gateway-events outcome) needs grouping — AND between
  dimensions, OR within one. Until that is written, those stay single-choice.

### Authentication & Authorization

- All routes require JWT auth by default (global `JwtAuthGuard`)
- Public routes use `@Public()` decorator to bypass auth
- Role-based access uses `@Roles('CEO', 'Administrator')` decorator with `RolesGuard` (string-based role names)
- JWT uses **access token (1h)** + **refresh token (24h)** pair
- **A token keeps the roles it was issued with for its hour.** `JwtStrategy.validate` never re-reads the account, so `@Roles()` and `@CurrentUser()` see the account as it was at sign-in or the last refresh. Two consequences (ADR-0028):
  - **Code that grants access must read the caller from the database, never trust the token's roles.** Both doors that hand out roles do: the employee form's ceiling and `POST /telegram/employee-link` read the caller through `whereUserMayAct()` (`common/auth/blocked-user.ts`: `deletedAt: null` and not SUSPENDED/TERMINATED/ARCHIVED), so an archived, blocked or demoted caller grants only what the database says, even while Redis is down. The link matters most: a signed link works for three days (ADR-0029), so whatever authority it is minted with lasts that long.
  - **Blocking must cut off the tokens already issued.** `JwtAuthGuard` refuses a token whose account has `user:blocked:<id>` in Redis. Every path that blocks or unblocks an account — a status change or an archive — calls `recordUserBlocked(redis, id, blocked)` after its database write; `UsersService` (employee page) and `TeachersService` (teacher page) do. A new path that skips it leaves the token live for its remaining hour, which is exactly how the employee page went uncovered while only `TeachersService` wrote the key. The key is a cache: the guard lets requests through when Redis is unreachable and confirms every hit against the database, and `recordUserBlocked` logs a Redis failure instead of failing the write.
  - **A role change deliberately does not cut off a token.** A demoted employee keeps their old role's pages until the token refreshes (at most an hour); the doors above stop them granting above their new level. Invalidating on role change (a "stale before" stamp answered with 401) was considered and deferred — see ADR-0028 before adding it.
- `POST /api/auth/login` returns both tokens + user data
- `POST /api/auth/refresh` refreshes the token pair
- **Every token carries the account's session version (`sv`, ADR-0030).** `User.sessionVersion` starts at 0. Any write of `User.password` bumps it in the same `update` through `passwordWrite()` (`src/common/auth/session-version.ts`), and `POST /users/logout-others` bumps it without a password. `refresh` refuses a token whose `sv` differs from the database; `JwtAuthGuard` stops an older access token on its next request through the Redis mirror `user:session-version:<id>` (fail-open, confirmed against the database before the 401). A token without `sv` counts as version 0. `password-write.single-source.spec.ts` fails on a raw `password` write anywhere but account creation.
- **A refresh token is not an access token.** `JwtStrategy` refuses `type: 'refresh'`.
- **The device that acts keeps its session.** `PATCH /users/password`, `PATCH /student-portal/password` and `POST /users/logout-others` return `{ accessToken, refreshToken, user }` (the first two also `message`); the client stores the pair. `AuthService.issueSession(userId, sessionVersion)` signs with the version the caller's OWN write produced, never one re-read afterwards, so a bump that lands in between wins. `logoutOtherSessions` bumps with a compare-and-set on the caller's `sv` (`updateMany where { id, sessionVersion }`): a token that is already behind gets 401 and changes nothing. A manager who sets their OWN password through `PATCH /users/:id` or `PATCH /teachers/:id` gets no fresh pair and is signed out like every other session.
- Use `@CurrentUser()` decorator to get the authenticated user in controllers

#### Phone-based login (all roles)

- **Every role logs in with their phone number** (the `login` field on the DTO now carries a phone in any format the user typed; the legacy username is still accepted as a fallback so no account is locked out). `AuthService.validateUser(login, password, allowedRoleIds?)` normalizes the raw input via `normalizeSharedPhone` (`src/common/utils/phone.util.ts`) — the single shared rule also used by the Telegram registration scenes: Uzbek numbers collapse to 9 digits, foreign numbers keep their country code. It then builds a deduplicated `OR` list (up to five clauses: the raw identifier as `login`, the normalized/raw digits as `phone`, and as `login`) + `deletedAt: null` + status ACTIVE/INACTIVE.
- **`User.phone` is not unique; `User.login` IS unique among live rows** — partial index `User_login_key ON "User"("login") WHERE "deletedAt" IS NULL` (migration `20260327021835_add_soft_delete_fields`), which `schema.prisma` cannot express and therefore does not show. Consequences: (a) a phone can map to several accounts (one person = one account per role, ADR-0022), (b) a second live account for a phone that is already someone's `login` is created with `login = null` (`loginForPhone` in `common/auth/phone-account-rules.ts`) — sign-in still works because the lookup matches `phone`, (c) at most ONE live STAFF account per phone is enforced in `UsersService.create` and `TeachersService.create` (`findLiveStaffByPhone`); a student account never blocks a staff account and a soft-deleted account frees both phone and login. The lookup is therefore **portal-scoped**: `LocalStrategy` (`passReqToCallback: true`) reads the `Origin` / `X-Portal` header, resolves the portal's allowed role IDs via `resolveAllowedRoleIds`, and passes them to `validateUser`, which filters `roles.some.role.id ∈ allowedRoleIds`. If several accounts still match within one portal, the **most recently updated** wins (`orderBy updatedAt desc`). Consequence: a wrong-portal login now returns 401 (`validateUser` finds nothing) rather than the old 403 from `login()`'s role gate — that gate stays as defense-in-depth.
- **SMS password reset works for every role** (not just students): `PortalPasswordResetService.resolveByPhone(phone, allowedRoleIds?)` matches `OR: [{ login }, { phone }]` scoped to the portal roles (from `Origin`/`X-Portal`), same tiebreak. See the Eskiz OTP flow under "SMS forgot password". A student's SMS reset also marks the card's phone as proved (ADR-0039, below).
- **A student signs in with the number on their card (ADR-0032).** Every lookup above reads the ACCOUNT (`User.login` / `User.phone`), staff edit the CARD (`Student.phone`). `StudentsWriteService.update` therefore moves the account in the same transaction as the card, through `planPhoneChange(..., { staff: false })`: `phone` follows, and a `login` holding the old number follows too — or becomes `null` when the new number is already a live login. It compares against the account, not the card's previous value, so the next save of a card edited before the rule heals it. The only other writer is the student's own first-run number change (ADR-0039, `StudentOnboardingService.replaceCardNumber`), through the same `planPhoneChange`. No other code may write an existing card's phone: `students/student-phone.single-source.spec.ts` fails the build. Accounts left behind before the rule: `scripts/repair-student-sign-in-number.ts` (dry run by default).
- **Operational caveat:** two live staff accounts on one phone predate the rule above (prod has two such pairs); until merged, only the most-recent one is reachable by phone. Audit before relying on phone-login: `scripts/audit-login-phone.ts` (read-only — flags missing phones + duplicate groups); `scripts/sim-phone-login.ts` simulates which account a phone resolves to per portal.

#### Telegram OAuth sign-in (web portals)

- **Web only.** All three portals (`admin` / `lehrer` / `student`) offer "Telegram orqali kirish" through Telegram's official OAuth 2.0 / OIDC flow. The student **native app** still uses the older bot-deep-link + `GET /auth/otp/poll` flow — that flow's `requestId` is minted by the client and approved by whoever presses START, so a forwarded `t.me` link can hand the victim's session to an attacker. OAuth closes that by construction; do not extend the poll flow to staff.
- **Endpoints** (all `@Public()`, all `IpThrottlerGuard`): `GET /auth/telegram/status` → `{ enabled }`, `GET /auth/telegram/start` → `{ url }`, `GET /auth/telegram/callback` (Telegram redirects here, 302s to the portal), `POST /auth/telegram/complete` → session.
- **The portal origin comes from the `Origin` header ONLY.** `start` takes **no query parameters** — an earlier `?origin=` override was the one way a production request could claim `http://localhost:3000` and bypass portal scoping, and the client never sent it. Do not re-add it. `isKnownPortalOrigin` also requires the `https:` scheme (localhost/127.0.0.1 exempt for dev) and rejects a URL carrying `username`/`password`, because that origin is where the single-use `handoff` is delivered.
- **`state` + PKCE live in Redis** (`tg_oauth:state:*`, 5 min, single-use via `getdel`) together with the portal origin. The `code_verifier` **never reaches the browser**, so a leaked authorize URL cannot be redeemed elsewhere; `state` + PKCE are what prevent code injection and code replay. **Nothing is stored in the browser** — no cookie, no verifier — so do not describe this pair as "binding the flow to the initiating browser". What actually closes the old bot-link relay hole is the delivery path: **Telegram hands the `code` to our server through the authorizing browser, and the `handoff` goes back out in that same browser's 302**, so the session lands in the browser that did the authorizing. The one residual this does _not_ cover: an attacker who authorizes with their own Telegram account can hand the victim their own `?handoff=` URL within the 60s window and the page will overwrite the victim's session with the attacker's. That is bounded (single-use, 60s), conspicuous (the victim is suddenly someone else), gives the attacker nothing they did not already have, and is not the hole this design targets — the old flow's defect was the reverse direction (the _victim's_ session opening in the _attacker's_ browser).
- **One `redirect_uri`, on the API domain** (`https://api.dafzentrum.uz/api/auth/telegram/callback`), because the code is exchanged with the client secret server-side. The portal to return to comes from the stored `state` and is re-checked against `isKnownPortalOrigin` — without that whitelist the callback would be an open redirect.
- **`id_token` verification is absolute**: RS256 against `https://oauth.telegram.org/.well-known/jwks.json`, `issuer=https://oauth.telegram.org`, `audience` = client id, `exp`, plus `phone_number_verified === true`. Any failure denies sign-in. Never add a soft path and never read the token without verifying it — the whole flow's trust rests on this signature.
- **Account lookup is shared with password login**: `phone_number` (no `+`, country code included) → `AuthService.findAccountsByIdentifier` (the `findMany`/`take: 2` twin of `findAccountByIdentifier`, sharing one private `buildAccountLookup` where-clause) → `AuthService.login` applies the portal role gate. The Telegram path must never be wider than the password path; that is why the where-clause is one function.
- **A shared phone FAILS CLOSED on the OAuth path.** `User.phone` is not unique (and `login` may be null), so one phone can match several accounts within the same portal (an office number on both a Cashier and an Administrator). Password login's `orderBy updatedAt desc` tiebreak is harmless — reaching the winning account still needs _that_ account's password — but OAuth removes that second factor, so picking a winner would sign the caller into a stranger's account. When `findAccountsByIdentifier` returns more than one row the OAuth path refuses with "Bu raqam bir nechta akkauntga tegishli. Iltimos, telefon raqam va parol bilan kiring." **`validateUser` is deliberately unchanged** — do not "make them consistent" by adding the refusal to password login, and do not drop it from the OAuth path.
- **Tokens never travel in a URL.** The callback redirects with a single-use `handoff` (`tg_oauth:handoff:*`, 60s) that the SPA exchanges. A URL would leak the session into browser history, referrers and proxy logs.
- **Failures after the `state` is consumed 302 to the portal, they do not throw.** `handleCallback` wraps everything past `consumeState` and returns `${portalOrigin}/auth/telegram/callback?error=<urlencoded message>`; the client page reads `error` and renders it with a "back to sign-in" button. Throwing there stranded the user on raw JSON at `api.dafzentrum.uz` with no way back. Only the message goes in the query string — nothing sensitive, and an unexpected (non-`HttpException`) error is replaced by a generic string and logged instead. The two failures that happen _before_ the origin is known stay JSON 400: a stale/replayed/unknown `state`, and the user-declined `error` branch. Relatedly, `!code` is checked **before** `consumeState` so a code-less redirect does not burn a single-use state.
- **`User.telegramChatId` is NOT written.** The `sub` claim is an opaque per-bot identifier, not the bot's `chat.id`; the Telegram user id is the separate `id` claim. Writing the wrong value would break bot messaging, and nothing here needs it. The verifier still asserts the `id` claim is **present and scalar** (a real strictness guard on the token shape) but deliberately does **not return the value** — no consumer wants it, and a large id parsed as a JSON `number` can exceed 2^53 and silently lose precision.
- **Config gate:** missing any of the three env vars turns the feature fully off — `status` returns `{ enabled: false }` and the client renders no button; `start` answers **503** (`ServiceUnavailableException`). `status` also reports `false` when the calling `Origin` is not a known portal, so a CORS-allowed non-portal origin (e.g. a Vercel preview alias) shows **no** button instead of one that 400s on click. Config is applied by hand in BotFather + Railway, so a half-configured deploy must degrade to "off", never to a broken button.

#### Telegram Mini App sign-in (student portal, ADR-0040)

- **Entry:** the bot opens `https://student.dafzentrum.uz/tg` (`TELEGRAM_MINI_APP_URL`) as a Mini App; that page posts Telegram's `initData` to `POST /auth/telegram/webapp` (`@Public()`, `IpThrottlerGuard`, 60/min/IP — there is no guessable secret here, and a class on the centre's Wi-Fi opens the Mini App from one IP within a minute). The controller is `auth/telegram-webapp/telegram-webapp.controller.ts`; the OAuth endpoints stay in `auth.controller.ts`.
- **Signature first, fields after** (`telegram-webapp/telegram-init-data.ts`): HMAC-SHA256 over every field except `hash` — sorted by key, `key=value`, `\n`-joined, Bot API 8.0's `signature` included — keyed with `HMAC_SHA256("WebAppData", TELEGRAM_BOT_TOKEN)`, compared timing-safe. A repeated key is refused, so the copy that was signed and the copy that is read cannot differ. `auth_date` is accepted for one hour, with 60 s of clock skew. `initData` is deliberately NOT single-use (a reload must still sign in — the trade-off is in the ADR). Never read `initDataUnsafe` or any field before the signature holds. The spec pins aiogram's independent test vector, so an algorithm mistake cannot hide behind a test that signs with the same code.
- **Identity is `Student.telegramChatId`**, which only bot flows write, when the sender's own Telegram number (contact button) matches the card's. That links the chat; it does NOT prove the card's phone (ADR-0039), and the Mini App never calls `markPhoneVerified` — the first-run steps are asked inside the Mini App like everywhere else. The Mini App never writes `telegramChatId` either. Outcomes: no live linked card → 200 `{ status: 'not_registered' }` (the client shows a message; there is **no** password fallback inside the Mini App); one card with an account → 200 `{ status: 'authenticated', ...session }`; several (a parent's Telegram) → 200 `{ status: 'choose', students: [{ id, firstName, lastName }] }`, and the client re-posts with a `studentId` that must be one of them (403 otherwise); linked cards without an account → 401 `NO_ACCOUNT_MESSAGE`. **Never pick one of several linked students server-side** — `findFirst` without an order is exactly that mistake.
- **The session is `AuthService.buildStudentSession(userId)`**, shared with the native app's poll, so the role-6 gate, blocked statuses and ADR-0033 apply identically.
- **Config:** no `TELEGRAM_BOT_TOKEN` → 503. `TELEGRAM_MINI_APP_URL` is validated at boot (`https:` only), because Telegram refuses a `web_app` button with a bad URL and, with it, the whole main-menu message.
- **Bot side** (`telegram/utils/mini-app.ts`): with the URL set, the main menu's «🎓 Platformaga kirish» becomes a `web_app` button in PRIVATE chats only (Telegram rejects the type anywhere else, failing the whole message); an old callback button is answered with a `web_app` button; the default chat menu button becomes «Kabinet» at boot. Removing the URL does NOT reset the menu button — a local server holding the production token must not clear production's menu; reset it in BotFather.
- **No channel gate** for the Mini App — the web portal has none either.
- **The Mini App gets the statement PDF through the bot.** Telegram's WebView cannot save a file, so `POST /student-portal/statement/telegram` (`TelegramStatementController`, Student + `StudentCardGuard`, SELF in the route manifest) has `TelegramStatementService` send the caller's statement to their card's `telegramChatId` — the chat the Mini App signed in with. It sends exactly what «💳 To'lovlar» sends, through the shared `statementForChat` (`telegram/flows/statement-flow.ts`): the answer box as a message, then the PDF. It lives in `TelegramModule` because that module already imports `StatementsModule`. Instant by design, like the other bot flows (`src/telegram/` is on ADR-0025's direct-send list). No bot → 503; no linked chat → 409 (nothing is built); a chat that refuses the bot (blocked, never started) → 409 asking the student to press /start; any other Telegram failure → 502, logged.

#### Staff in the bot and the staff Mini App (ADR-0045)

- **Staff identity is `User.telegramChatId`**, separate from a student card's link. One where-clause decides who counts as staff for the bot, the Mini App and linking: `signInStaffWhere` / `staffLinkedToChatWhere` in `common/auth/staff-telegram.ts` — live, status in `SIGN_IN_USER_STATUSES` (`common/auth/blocked-user.ts`, the same list `buildAccountLookup` uses), and a staff role (1–5; role 6 is filtered out, so the student portal's roles match nobody). The password is checked where the session is issued, as Telegram OAuth does (401 `STAFF_SIGN_IN_DISABLED_MESSAGE`), not in the where-clause: a `password` key there trips `password-write.single-source.spec.ts`. Two live staff accounts on one chat fail closed everywhere — the bot shows no staff menu and the Mini App answers 401 `SEVERAL_STAFF_ACCOUNTS_MESSAGE`. Never pick one server-side.
- **Portal:** `staffPortalFor(roleIds)` — any of 1, 2, 3, 5 → `admin`, teacher only → `lehrer`. The employee-registration scene's "already registered" fallback uses it too.
- **Mini App:** `POST /auth/telegram/webapp/staff` (`@Public()`, `IpThrottlerGuard`, 60/min/IP, PUBLIC in the route manifest) takes `{ initData }` only. The same `initData` check as the student door, then `AuthService.findStaffAccountsByTelegram(telegramUserId, getAllowedRoleIds(origin) ?? STAFF_ROLE_IDS)` (`take: 2`), then `AuthService.login(user, origin)` — the password door's portal gate. No match → 200 `{ status: 'not_registered' }`; an account without a password → 401. The student door (`POST /auth/telegram/webapp`) answers `{ status: 'staff' }` when no card is linked but the Telegram is a staff account, so the client can send them to the bot instead of saying "not registered".
- **Bot** (`telegram/staff/`): `StaffCabinet.greet` runs in `/start` right before the student menu. A staff chat gets the staff greeting and menu (`staffMenuKeyboard`: Kabinet → profile, Jadval, Guruhlar, Oyligim for teachers, the student cabinet when the chat also holds a card) and its own menu button (`setChatCabinetButton` in `telegram/utils/mini-app.ts` — `setChatMenuButton` with a `chatId`, which Telegram puts above the default «Kabinet»). A chat that some `User` row still names but that no longer qualifies gets the default button back; any other chat is not touched, so a student's `/start` costs no Telegram call. **Every boot also sets the button for every linked staff chat** (`StaffCabinet.syncButtons`, fire-and-forget after the default button, one call per chat, a chat with several staff accounts skipped): without it the button changed only on `/start`, and no staff member linked before ADR-0045 had pressed it, so all 26 opened the student cabinet and got «Siz xodim sifatida ro'yxatdan o'tgansiz». It does not reset ex-staff chats; `/start` still does that. **An old `web_app` «🎓 Platformaga kirish» opens the STUDENT Mini App**, and a sent message cannot be edited (the bot cannot list past messages); so when the student door answers `staff`, `TelegramWebAppService` emits `STAFF_CABINET_REQUESTED` (`common/auth/staff-telegram.ts`) and `TelegramService.onStaffCabinetRequested` has `StaffCabinet.sendCabinetButton` send the chat a fresh «💼 Kabinet» button (and set its menu button). Redirecting the Mini App across hosts instead is not an option: since Bot API 10.2 Telegram drops Mini App methods from any origin but the first. The old `menu_platform` callback answers staff with the staff cabinet. Staff URLs are derived from `TELEGRAM_MINI_APP_URL` by swapping the host's `student.` label for `lehrer.`/`admin.` (`staffMiniAppUrl`); unset, or a non-`student.` host (a local tunnel), leaves the staff cabinet off and the bot as before.
- **Linking an existing staff account:** `t.me/<bot>?start=xodim` or `/xodim` enters `SCENES.STAFF_LINK`. The sender's own contact (`contactBelongsToSender`) whose number equals exactly one qualifying staff account's `phone` links the chat (`linkStaffChatByPhone`, one transaction): the chat is taken off any other live account first, an account linked to another chat moves (the old chat's button is reset), and each write is a `User` history row with the staff member as actor. Several accounts on the number → refused. This is the proof Telegram OAuth already signs staff in with, so the door is no wider. A number that does not match is fixed by an administrator changing the account's phone (ADR-0031's path) — there is no admin-issued link yet.
- Nothing writes `telegramChatId` from the Mini App, and the native app's poll flow is still never extended to staff.

#### Your own sign-in keys change only with your current password (ADR-0031)

A phone is a sign-in key, not contact data: Telegram sign-in finds the account by it with no password, SMS reset sends its code there, and `buildAccountLookup` also matches the number against `login`.

- **Your own phone changes only through `PATCH /users/phone`** (`ChangePhoneDto`: `phone` + `currentPassword`, `@Roles(...STAFF_ROLES)`), the twin of `PATCH /users/password`. `UpdateProfileDto` carries no phone — do not add it, or any other key field, back: the profile door is name and photo.
- **No other door writes your own key.** `PATCH /users/:id` and `PATCH /teachers/:id` refuse (403) a caller changing their OWN phone or login, or setting their own password (`assertNotChangingOwnSignInKeys`, `common/auth/own-sign-in-keys.ts`). A value the employee form re-sends unchanged is not a change. Nobody changes their own login: it moves with the phone. Editing someone else is the rank rule's business (ADR-0027), not this one.
- **A phone change retires the old number.** Every write of an existing account's phone goes through `planPhoneChange` (`common/auth/phone-account-rules.ts`): it refuses a number another live staff account holds (ADR-0022), and moves a `login` holding the old phone (also as `998…`) to the new one — or to `null` when the new number is already some live account's login. Without it the old number would stay a sign-in key.
- **Checking the current password is capped:** 5 attempts per account per 15 minutes, one counter shared by every door that asks for it (`OwnPasswordAttemptGuard`, `common/guards/own-password-attempt.guard.ts`; answers 429). A new door that checks the current password must carry it — `own-password-attempt.routes.spec.ts` lists them.
- Students change their own phone only in the first-run phone step (ADR-0039): «Yo'q, boshqa raqam» takes the new number **and the current password** (`POST /student-portal/onboarding/phone/change-code`, carries `OwnPasswordAttemptGuard`), the SMS code goes to the new number, and only a correct code writes it — through `planPhoneChange`, like the staff edit. Once the card's number is proved the door is closed and staff change a student's phone.

#### Student first-run requirements (ADR-0039)

Before the student portal or the native app opens, the student proves the card's phone by SMS and gives gender and birth date.

- **The rule lives once, in `students/shared/student-onboarding.ts`** (`missingOnboardingSteps`, returns `PHONE` / `GENDER` / `BIRTH_DATE` in display order). Both clients gate on `GET /student-portal/onboarding` and compute nothing themselves.
- **Verified means `Student.verifiedPhone === Student.phone`** — the proved number is stored, not a flag. A staff phone change (ADR-0032) therefore reopens the step with no extra code; do not add an `isPhoneVerified` boolean. The only writer is `markPhoneVerified` (`students/shared/mark-phone-verified.ts`), an `updateMany` conditional on the card still carrying that number.
- **An SMS password reset counts as proof**: `ForgotPasswordService.resetPassword` calls `markPhoneVerified` with the number the code went to (best-effort, after the password write). The migration `20260927120000_student_phone_verification` backfills past SMS resets, only where the code's destination is unambiguous (the account's 9-digit login/phone are the card's number, and the card's number has not changed since).
- **Endpoints** (`StudentOnboardingController`, `@Roles('Student')` + `StudentCardGuard`, SELF in the route manifest): `GET /student-portal/onboarding` → `{ missing, phone, phoneVerified }`; `PATCH /student-portal/onboarding/profile` (`gender?`, `dateOfBirth?` as `YYYY-MM-DD`, age 5–100 against the Tashkent calendar) writes **only fields that are empty** — staff-entered values are never overwritten, a repeat is a no-op; `POST .../phone/send-code` and `POST .../phone/verify` (`{ code }`). Every write returns the new status.
- **Before any SMS the step asks «Bu sizning raqamingizmi?»** (9-digit Uzbek numbers only; a foreign card number is never asked).
  - «Ha» → `POST .../phone/send-code`: the code goes to the card's number.
  - «Yo'q, boshqa raqam» → `POST .../phone/change-code` `{ phone, currentPassword }`: the password is checked first (ADR-0031 — an SMS to a new number proves that number, not the account), then the number must not be another live student's card phone or student account phone/login (`NUMBER_TAKEN_MESSAGE`; staff accounts do not count, ADR-0022), then the code goes to the NEW number. The Redis code carries `from` = the card's number at send time; a correct code runs `replaceCardNumber`: one transaction writes `Student.phone`, moves the account through `planPhoneChange(..., { staff: false })` and calls `markPhoneVerified`; history shows Telefon, Login and «Telefon tasdig'i» with the student as actor. The number is re-checked at write time.
  - Policy mirrors the reset OTP but is keyed on the student and speaks plainly (the caller is signed in, so no anti-enumeration): 4 digits, 5 min, 3 tries, 60 s resend cooldown, 5 SMS/day per student, 3/day per typed number, 30 verify calls/hour, global `PHONE_VERIFY_SMS_GLOBAL_HOURLY_CAP` (300). An Eskiz failure gives the attempt back. A code sent before staff changed the card's number is refused in both modes.
- **Switched off by default.** The phone step is asked only when `STUDENT_PHONE_VERIFICATION_ENABLED=true` **and** Eskiz is configured. The SMS text (`buildPhoneVerifyMessage`) is not the reset template and must be moderated by Eskiz first — switching on before approval would lock every unverified student out. Gender and birth date are compulsory regardless.
- There is **no server-side block** on other student endpoints: old app builds in the stores do not know the screen and would show errors everywhere. The clients gate; they fail open when the status request has no answer.
- **Telegram never proves the phone** (CEO decision, 2026-09-27). Neither a Telegram sign-in (`phone_number_verified` in the OAuth `id_token`) nor a contact shared with the bot marks the card: they prove the Telegram account's number, and the student may use a different one. `phone-proof.single-source.spec.ts` fails the build if anything but `markPhoneVerified` writes `verifiedPhone` / `phoneVerifiedAt`, or if anything but the two SMS paths calls it.
- **Staff see the verdict, not the number**: `formatStudent` returns `phoneVerified` and `phoneVerifiedAt` (null while unproved) and drops `verifiedPhone`. The staff card shows it beside a separate "Telegram botda ro'yxatdan o'tgan" badge (`telegramChatId` set) — two different facts.

### Portal-Based Role Restriction (Subdomain Routing)

The system uses **subdomain-based portals** — each subdomain restricts login to specific roles:

| Portal         | Domain                  | Allowed Roles                                                                                                                               |
| -------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Admin panel    | `admin.dafzentrum.uz`   | CEO (1), Branch Director (2), Administrator (3), Cashier (5)                                                                                |
| Teacher portal | `lehrer.dafzentrum.uz`  | Teacher (4)                                                                                                                                 |
| Student portal | `student.dafzentrum.uz` | Student (6) — implemented via `student-portal.controller.ts` (profile, schedule, attendance stats/history/scan, payments via Payme + Click) |

- Configuration: `src/auth/portal-roles.config.ts` — `PORTAL_ROLES` mapping
- **How it works:** `LocalStrategy.validate` resolves the portal's role IDs with `resolveAllowedRoleIds(origin, portal)` (the browser `Origin`, or the `X-Portal` header native apps send), and `AuthService.validateUser` looks the account up **among those roles only**. An account without a matching role is simply not found: **`401` "Login yoki parol noto'g'ri"**, the same answer as a wrong password. The same scoping picks the right account when one phone belongs to several accounts (ADR-0022)
- **Backstop:** `AuthService.login()` re-checks the roles and throws `ForbiddenException` ("Sizning rolingiz bu portalga kirish huquqiga ega emas"); after the scoped lookup a password login does not reach it
- **Localhost/dev:** Returns `null` (no restriction) — all roles can log in from localhost
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
  so a title is written the first time anyone is edited. The bot's
  `employee-registration.scene.ts` also calls `UsersService.create`, so this
  requirement broke bot onboarding until it was fixed: a link can grant
  several roles, and the scene derives the position from them via
  `derivePositionForRoles(roleIds)` (`telegram/constants.ts`'s
  `POSITION_LABELS`, lowest role id wins) — a teacher's link (role 4 alone)
  gets `"O'qituvchi"`. Any future caller of `UsersService.create` must supply
  a position; reach for that helper rather than writing a second role→position
  map.
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

- **Salary/financial endpoints** — restrict to `@Roles('CEO', 'Branch Director')` only. **Exception, decided 2026-08-12:** the four READ endpoints behind `/payments/debt` (`GET /reports/monthly-debt-recovery/history` · `/:monthKey/aging` · `/:monthKey/detail` · `/excel`, plus `GET /reports/debt-write-offs-summary` and `GET /transactions/debt-write-offs`) are open to every staff role, because that page must not change shape by viewer — a screen whose tabs appear or vanish per role is one nobody can be told how to use. The WRITE that moves money back, `POST /billing/debt-write-offs/:id/reverse`, stays CEO-only. `GET /reports/monthly-debt-recovery` (the cohort report behind the Excel workbook, not a page) was deliberately NOT widened. `GET /salary/monthly/center-topup` (the «Markaz qoplagani» tab) joined the open reads on 2026-09-30 — it had stayed CEO/BD/Administrator and answered a cashier with 403; Teacher stays out. The page's WRITES keep their own gates and the client hides them per role: a cashier gets no «Natijani kiritish» (`POST /call-logs`) and no «Muzlatilgan puli» row actions (`POST /withdrawals`, `POST /refunds/quick`)
- **Salary page reads** — CEO/BD only (2026-09-30). Administrators do not see salaries, so every `GET /salary/*` read that only `/payments/salary` uses refuses them (`/monthly`, `/overview`, `/matrix`, `/payments`, `/payments/:id/breakdown`, `/accruals/:userId`, `/advances/:userId`, `/advance-calendar`, `/config/:userId`, `/configs/by-users`, `/config-history/:userId`, `/period-settings`); the page itself has been hidden from them since April. Two reads stay open to Administrator because pages they use call them: `GET /salary/timeline/:userId` (teacher profile «Taymlayn» tab) and `GET /salary/monthly/center-topup` (debt page). Pinned in `salary.controller.spec.ts`
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
- **Deleting a group closes its enrollments.** `GroupsWriteService.delete` archives the group and, in the SAME Serializable transaction, closes every ACTIVE and FROZEN enrollment in it as DROPPED through `StatusCascadeService.cascadeGroupDeletion` — unused prepaid lessons and the rest of the month's charge back to the balance, a state-log row at `group.deletedAt`, and the removal in each student's and the group's history. Before this the group alone was archived and its students stayed enrolled in a group that no longer existed. Restoring the group from the archive now brings it back empty — before, its enrollments had never been closed and came back with it. Its students must be re-added by hand (their money is already on the balance); re-opening the old enrollments would hand a MONTHLY student the rest of the month for free and can collide with the one-ACTIVE-enrollment-per-student index. A deleted group's students now count as departures (DROPPED, no exit reason) on the day it is deleted, as a cancelled group's do.
- **The delete dialog shows what a deletion takes with it.** `GET /groups/:id/delete-preview` returns `{ active, frozen }`, counted with `liveEnrollmentsOfGroup` (`common/status/status-cascade.service.ts`), the filter `cascadeGroupDeletion` closes with, so the number the admin confirms is the number that closes. The groups list's `studentCount` counts ACTIVE only and cannot answer it: the students stranded by earlier deletions were all FROZEN. `DELETE /groups/:id` takes an optional `reason` (`DeleteGroupDto`, at most 500 characters, blank = none): the group's `StatusHistory.reason` and `statusChangeReason` (default "O'chirildi") and its DELETE history row's `deletionReason`; every enrollment the deletion closes carries `groupDeletedReason(reason)` ("Guruh o'chirildi: <reason>") in its `statusChangeReason`, state-log row, history `sabab` and refund reasons. The response message says how many students left the group.
- **Closing a group closes its FROZEN enrollments too (ADR-0036).** A group going CANCELLED, a branch going CLOSED/ARCHIVED and a course going ARCHIVED drop every ACTIVE **and FROZEN** enrollment of the groups involved. A group going COMPLETED completes its ACTIVE enrollments and **drops** its FROZEN ones: a student frozen when the group ended did not finish it, and auto-graduation reads COMPLETED rows only, so it never picks them. Before this `StatusCascadeService.cascade` closed only ACTIVE rows, and a FROZEN one stayed FROZEN in a closed group forever — the activity report and the student's groups tab read it as still in the group, the teacher-payments report counted it among the closed group's students, and unfreezing the student never reopened it (the unfreeze cascade only reopens enrollments in ACTIVE groups). Money follows the usual closing rule (unused prepaid lessons and the rest of the month's charge back to the balance), normally a no-op for a frozen row because the freeze already returned both. Rows left from before are closed by `scripts/repair-closed-group-enrollments.ts` (dry run by default), backdated to the group's own status change.
- **A group status change is all or nothing (ADR-0041).** `GroupsStatusService.changeStatus` re-reads the group inside ONE Serializable transaction (maxWait 15 s, timeout 60 s, the group-deletion budget) and runs the transition check and StatusHistory, the group's EntityHistory, the enrollment side (`StatusCascadeService.cascadeGroupStatusChange`: closing with refunds, state log, removal/completion history and auto-graduation, all on `tx`) and the group row there. A failure rolls everything back and the admin reads «Guruh holati o'zgarmadi, hech narsa saqlanmadi. Qayta urinib ko'ring.» (409 for Prisma `P2034`/`P2028`, 500 otherwise; an `HttpException` passes through). `cascade()` takes `'Branch' | 'Course' | 'Student'` only; those cascades keep per-enrollment transactions.
- **A student's sign-in account lives and dies with the card (ADR-0033).** `StudentsWriteService.delete` archives the card and its student-only account (`STUDENT_ONLY_ACCOUNT`, `common/auth/student-account.ts`) in one transaction with `userArchiveData`; `ArchiveRestoreService.restore` reopens it with the login re-derived from the card phone and refuses a card whose phone is on another live card. EXPELLED / FROZEN / GRADUATED leave the account open on purpose (debt is paid through the portal). The archive users tab ("Ustozlar / Xodimlar") never lists a student-only account, and `AuthService` refuses one with no live card. Any new path that archives student cards must close their accounts the same way.
- **A student card is born with its sign-in account.** Admin create (`createStudentUser`), mock participant conversion (in the card's own transaction) and Telegram registration all open it with `openStudentAccount`; conversion also refuses a phone that is already on a live card, like admin create. A new file that writes Student rows fails `common/auth/student-account.single-source.spec.ts` until it calls `openStudentAccount` (writing a Student-role `User` by hand does not count). Only Telegram registration shows the generated password — the bot sends it to the student who just registered; everyone else gets one from the bot's "Parolni tiklash" or signs in with Telegram.
- Archive endpoints (`/api/archive/*`) are **CEO-only**: list, detail, restore, permanent delete
- **Permanent delete** (`DELETE /api/archive/:entityType/:id`) removes the record from DB and deletes associated files from Cloudflare R2
- Files (photos, avatars) are **NOT deleted** during soft delete — only during permanent delete from archive

### Entity History (Audit Log)

- A **universal `EntityHistory` table** tracks all changes (CREATE, UPDATE, DELETE, STATUS_CHANGE, RESTORE) for every entity (Student, Branch, Room, Course, Group, User, Lead, Holiday, Enrollment)
- Every service that performs a mutation **must** record the change via `EntityHistoryService` — this is **not optional**
- **Cross-entity history is mandatory** — when a mutation on entity A cascades to entity B, history must be recorded on **both** entities. Examples:
  - Student status change (FROZEN/EXPELLED/ARCHIVED) cascades to enrollments → record in **Group** history (e.g. `OQUVCHI_MUZLATILDI`, `OQUVCHI_CHETLATILDI`)
  - Group COMPLETED auto-graduates students → record in **Student** history
  - Group deleted → every live enrollment DROPPED → record in each **Student**'s history (`GURUHDAN_CHIQARILDI`) and in the **Group**'s (`OQUVCHI_CHIQARILDI`), the same records `removeFromGroup()` writes
  - Group CANCELLED/COMPLETED, branch CLOSED/ARCHIVED, course ARCHIVED → each DROPPED enrollment gets the same two removal records; each enrollment a completed group COMPLETES goes to the **Student**'s history alone (`GURUH_TUGALLANDI`), keyed `statusEnum` — never `status`, which the `entity.status.changed` listeners read as the student's own status and answer with a system comment and a Telegram digest line
  - Any operation affecting group composition (student add/remove/freeze/unfreeze) must appear in that group's history
  - Any operation affecting a student's enrollment or status must appear in that student's history
- **Cascade services must record history** — `StatusCascadeService` injects `EntityHistoryService` and records cross-entity history for all cascade operations. When adding new cascade logic, always include corresponding history records
- The service is global (`EntityHistoryModule` in `src/common/entity-history/`) and injectable in any service without importing the module
- Methods: `recordCreate()`, `recordUpdate()`, `recordDelete()`, `recordStatusChange()`, `recordRestore()`
- **Status events wait for the commit.** `recordStatusChange` emits `entity.status.changed` at once unless the caller passes `deferredEvents`. A caller inside a transaction must pass it and call `emitStatusChanged(deferredEvents)` after the commit; otherwise a rollback leaves a system comment and a Telegram digest line for a change that never happened.
- For **UPDATE**, pass the full old and new objects — the service auto-computes the diff via `computeChangedFields()` in `diff.util.ts` and only stores changed fields. If nothing actually changed, no history record is created
- **A key missing from `oldValues` is dropped, silently.** The diff walks only keys both objects carry, so `oldValues: { paid: false }` with `newValues: { paid: true, paymentMethod: 'CASH' }` stores `paid` alone. To record a field that had no previous value — a method, a reason, a transaction id — put it in `oldValues` as `null`. Every mock payment's method and note were lost this way until 2026-09 (ADR-0046); a spec that mocks `EntityHistoryService` cannot see it, so assert through `computeChangedFields` (see `mock-exam-double-payment.spec.ts`)
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
- **Telegram stats crons skip Sundays and holidays**: `TelegramGroupDailyCronService` (21:00 daily report) and `TelegramGroupDigestCronService` (20:00 group digest from the `TelegramDigestItem` queue, ADR-0025) first call `isTashkentSunday()` (in `telegram-groups/utils/format.util.ts`) and short-circuit on the weekly day off, then call `findActiveHolidayCovering(new Date())` and return early on bayram days. Personal Telegram notifications (enrollment, debt, task, attendance) are queued and sent by `TelegramDigestPersonalCronService` at 20:00 every day, Sundays and holidays included (ADR-0025); lesson cancellation/reschedule and the other messages on ADR-0025's instant list still fire when the user action happens. The attendance-reminder cron has had its own holiday short-circuit since the original implementation.
- **Daily report composition (`TelegramGroupDailyReportService.build`)**: the 21:00 message body is built here (the `TelegramGroupStatsService.buildDailyReport` used by `/hisobot` is now a thin delegator returning only `.message`). One glance with a 🚦 traffic-light header (🟢/🟡/🔴 via `resolveTrafficLight`) then sections: 💰 today's cash-in (by method) / operational spend (Expense minus `TEACHER_ADVANCE`, `date` is a DATE column so match `tashkentTodayDate()`) / net; 👥 new − departed students (`Enrollment` DROPPED distinct `studentId` today; TRANSFERRED excluded) + new leads (`Lead` is single-tenant, global count) with today's conversions; 🎓 lessons + attendance (LATE/EXCUSED broken out, % = attended/(attended+absent)); 📌 active students + the debt as two numbers — `O'qiyotganlar qarzi` (count, total, the day-over-day ▲/▼), its `shu oy` / `eski qarz` sub-line (left out when nobody studying owes) and `O'qimayotganlar qarzi` — from `ReportsService.getDebtSplit` (ADR-0059, see "Debt as two numbers" under Reports Module: never added, never re-derived here; the ▲/▼ and the 🟡 debt-growth rule follow the studying debt alone, `O'qimayotganlar qarzi` is only printed; shared renderer `telegram-groups/utils/debt-split-lines.util.ts`, which `/qarzdorlar`, `/stats` and the `rm:cfin` card print too); 📅 MTD income/expense/**Avans**/net + `Shu oyning darslari`, then, in a monthly-billing month (from 2026-09, `isMonthlyBillingMonth`), `Bu oy hisoblandi` / `To'landi` / `Qoldi` from `ReportsService.getMonthCharges` (ADR-0058; shared renderer `telegram-groups/utils/month-charges-lines.util.ts`, which the `rm:cfin` card prints too). Such a month NEVER prints `Shundan yig'ildi`, `Oy oxiriga kutilyapti` or `Oy rejasidan yig'ildi` — not even when `getMonthCharges` fails: the three new lines are then simply absent and a warning is logged. An earlier month keeps `Shundan yig'ildi` (the collection ratio), `Oy oxiriga kutilyapti` (`ReportsService.getMonthlyExpectation` — see "One month-end expectation" below; NEVER re-derive it here, the line it replaced was a local `exactDays × 4` walk) and `Oy rejasidan yig'ildi` — **`Xarajat` (operational, advance-free) and `Avans` (`TEACHER_ADVANCE`) are separate lines; `Sof foyda` is the canonical `ReportsService.getMonthlyNetProfit` figure (see "One canonical Sof foyda" below), and the cash reading `Tushum − Xarajat − Avans` prints on its own line as `Kassa harakati (oyliksiz)`** — alone, never labelled `Sof foyda`, when the canonical figure fails; the two MTD `Expense.aggregate` queries bound `date` with a **date-only** Tashkent month window `[firstOfThisMonthDate() … tashkentTodayDate()]` — **NOT** `firstOfThisMonthUtc()`, which is a -5h-shifted timestamp that Postgres floors to the previous month's 30th/31st against a DATE column and leaks that day's rows (e.g. June-30 rent/salary) into the total; the income query keeps `firstOfThisMonthUtc()` because it filters `Payment.createdAt` (a real timestamp). This makes the telegram `Xarajat` reconcile exactly with the `/payments/expenses` page (same advance-free month window). **The PRINTED `Tushum (haqiqiy)` line no longer comes from that aggregate** — it is `getIncomeMonthAttribution(...).total`, because the two lines under it (`Shu oy uchun` / `Eski qarzlar uchun`, then one row per older month, ALL of them) are a decomposition of it and a headline from a second source can fail to add up in front of the reader. Same window, different basis: the aggregate sums the `Payment` table, the attribution tallies the effective ledger's `PAYMENT` rows, and they agree only while the G1 invariant of `scripts/audit-finance-reconciliation.ts` holds — `logIncomeBasisDrift` warns into the log when they diverge instead of hiding it. The `Avans` line self-suppresses when the MTD advance total is 0. 💵 `Ustozlar oyligi` — `SalaryMonthlyService.getMonthly({}, companyId, ceoId).totals` deserved/covered/**centerFunded** (the center top-up — written accruals plus the not-yet-settled forecast, so it does NOT drop to 0 once the month is settled, hidden when a CEO/Admin caller is missing or the month is all-null); 🚩 self-suppressing `Diqqat` flags (today's REFUND / DEBT_WRITE_OFF / large ADJUSTMENT rows still in force — `reversedAt` and `reversedTransactionId` both null, so neither half of a cancelled pair is a flag (ADR-0058) — + low-attendance) collapsing to "✅ Bugun jiddiy muammo yo'q" on a clean day. The expectation, the month charges, the collection ratio and salary are each `try/catch`-wrapped so one failing just drops its own line(s). The debt split is NOT: it sits in the main read batch, so a failure fails `build()` instead of printing a zero (a zero reads as «nobody owes»). Company name is `escapeHtml`-escaped. The cron builds once per company (reused across its groups) and writes no snapshot: the debt ▲/▼ compares against the latest earlier **`DailyFinancialSnapshot`** row of the same scope, which `DailySnapshotCron` writes at 23:40 (see "The daily snapshot is the one record that cannot be rebuilt"); `/hisobot` on-demand writes nothing either.
- **Interactive report menu (`TelegramGroupReportMenuService`)**: the daily report (and `/hisobot`) carry a `« Ko'proq imkoniyatlar »` inline button (`reply_markup`, `TelegramGroupReportMenuService.moreButton()`). `TelegramAdminBotRegistrar.registerReportMenu` wires `bot.action(/^rm:.../)` handlers (the admin bot previously had NO callback_query handling). The menu is **stateless** — all flow state rides in `callback_data` (`rm:open|root|close`, `rm:full→rm:fy:YYYY→rm:fm:YYYY-MM`, `rm:cmp→rm:ca:YYYY-MM→rm:cb:A:B`, `rm:pre→rm:p3|p6|p12|py:YYYY`, `rm:cfin`) because the admin bot has no session and a group session key would collide across members. Navigation edits the same menu message; each generating leaf sends the Excel as a NEW document. It calls `ReportsExcelService.generate()` (already returns a Buffer; **now exported from `ReportsModule`** along with `ReportsFinancialService`; `TelegramGroupsModule` imports `ReportsModule`) with a month/period/preset range: single month = `compareModes:[]`; comparison = later month as period + `compareModes:['custom']` + earlier month as `compareStartDate/End`; yearly = `['yearly']`. `performedById` = the company CEO id (salary-sheet scope). Month/year lists run from `Company.systemStartDate`'s floor month (2026-05 here, NOT March). `rm:cfin` posts an in-chat `getFinancialOverview` text card (no file), whose income line carries the same `Shu oy uchun` / `Eski qarzlar uchun` split as the 21:00 report (shared renderer `telegram-groups/utils/income-split.util.ts`). Its month line (`monthFigureLines`) is the three month-charge lines in a monthly-billing month and `Oy oxiriga kutilyapti` from `ReportsService.getMonthlyExpectation` before it — never the raw overview, which carries no expectation (its former `income.expected` was a hard-coded 0, since removed); a failure drops the line and the rest of the card is still sent (ADR-0058). That card **passes its month explicitly** to `getIncomeMonthAttribution`, so the split describes the month the card's title names, resolved once. Its debt lines (`debtLines`) pass it too: `ReportsService.getDebtSplit`'s two numbers (ADR-0059) for the group's scope, in the 21:00 report's lines (shared renderer `telegram-groups/utils/debt-split-lines.util.ts`) — the raw overview carries no debt figure — and a failed split drops just its debt lines. **Trust model: READ-ONLY at group level** — the workbook goes to the same group already getting daily financials; a group callback has NO per-user ERP identity, so NO mutation is ever reachable from a group button (any future actions must move to an identity-linked DM). **Webhook caveat**: the admin bot has no `handleUpdate` route, so callback_query only works in polling mode (`TELEGRAM_ADMIN_BOT_WEBHOOK_URL` unset) — verify before relying on buttons. **Double-tap guard**: `generateAndSend` adds the chat id to an in-flight `Set` SYNCHRONOUSLY before its first await, so a rapid second tap can't produce a second workbook (it toasts "kuting…"); on start it edits the menu to a "⏳ tayyorlanmoqda" state (removes buttons) and restores it after. **Past-month sheets**: `ReportsExcelService.generate` now takes `hidePointInTimeForPastPeriod?` (FinancialExcelQuery) — when set AND the period ends before the current Tashkent month, it drops the five LIVE-state sheets (Balans, Qarzdorlar, KPI paneli, Xonalar bandligi, Guruhlar to'ldirilishi) + the two `bs`/`debtors` Tekshiruv rows (`reconciliationSheet`'s `includePointInTime` param), because those read current DB state and can't be faithfully rebuilt for a past month (no historical cash-balance snapshot). The bot sets the flag on every export; the web `/payments/overview` export leaves it unset (unchanged).

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
- `StatusCascadeService.cascadeEnrollmentStatus()` — helper used by all cascade transitions (Branch/Course/Student status changes that flip enrollments), by group deletion (`GroupsWriteService.delete()` → `cascadeGroupDeletion()`) and by a group's own status change (`GroupsStatusService.changeStatus()` → `cascadeGroupStatusChange()`); the last two pass their own transaction so the log rows commit with the change
- `ArchiveRestoreService.restoreBatch()` — restore creates ACTIVE event
- `telegram/scenes/student-registration-flow.ts` — telegram bot enrollment

**When adding new code that mutates these fields:** wire the corresponding snapshot write or the activity report will silently use the new value retroactively.

#### Reads

`reports-center-activity.service.ts` — `loadSnapshots()` fetches all snapshots overlapping the period in one batched query and returns in-memory `Map`s keyed by entity ID. Per-date lookups (`capacityOn`, `scheduleOn`, `priceOn`, `statusOn`) walk the small per-entity arrays. Falls back to current entity values when no snapshot exists (degraded mode for un-backfilled data).

`statusOn` reads through `enrollmentStatusOn` (`students/shared/enrollment-status-on.ts`), the reader the departures loader uses too, and each enrollment's log first passes through `supplyOpeningRow`, which the loader shares. An enrollment opened before the state log existed (up to 2026-04-26) can have a log that starts with its closing, the opening ACTIVE row never written; without that row it reads as absent from its creation until its first logged transition.

`reports/shared/teacher-change-departures.ts` — the teacher-change retention card and its drill-down list ("left within 5 lessons of a teacher change") date a departure by the start of the enrollment's current stop: its earliest FROZEN/DROPPED log row after its last ACTIVE row. Never by `statusChangedAt` — that column moves again when a frozen enrollment is closed later (expelled, archived, its group closed), which used to pull a student out of the window they froze in. A closing that was never logged is completed from the row by `supplyClosingRow`, which the departures loader shares. Both readers go through `loadTeacherChangeDepartures`, so the count and the list cannot disagree.

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

Every attendance write (manual `save()`, QR `startSession()` and every QR scan) and every planned absence passes through `validateLessonDate(groupId, date, companyId?)` (`AttendanceValidationService`, also on the `AttendanceService` facade). It has no clock and takes no roles, and returns `{ group, parsedDate, effectiveStartTime, effectiveEndTime, opensMinutesBefore }`. It enforces:

1. Date format (YYYY-MM-DD)
2. Group existence + multi-tenant `companyId` filter
3. Group status must be `ACTIVE`
4. Date within group `startDate`–`endDate` range
5. Day-of-week matches group `exactDays` schedule
6. Date is not a holiday **of the group's branch** (`Holiday` table; `findActiveHolidayCovering(date, group.branchId)` — a company-wide holiday covers every branch, another branch's holiday covers none of this one). The reminder tick, the lesson-end sweep and the group calendar judge holidays per branch the same way
7. **The lesson's times and the lead, no clock.** The #608 teacher clock (`TIME_BYPASS_ROLES`, "O'qituvchi davomatni faqat dars kuni belgilaydi…") was deleted when #595/#596 were integrated: it hard-coded 10 minutes against the configurable lead, and item 8's guard is the one clock for every role. A teacher trying another day now gets the guard's texts.
   - **The lead is a setting:** `opensMinutesBefore` is `payment.attendanceOpensMinutesBefore` (0–60, default 10, company-level, CEO only; ADR-0048 §5), read through the public `AttendanceValidationService.opensMinutesBefore(companyId)`. `GET /attendance/:groupId/date/:date` returns it for the form, and `client/src/lib/attendance-window.ts` uses it.
   - **The lesson's real times come from ONE helper, `effectiveLessonTimes`** (`attendance/shared/attendance-window.ts`): a day moved here by a `LessonReschedule` uses the move's own times when it set any, every other day the group's. `validateLessonDate` (which returns `effectiveStartTime` / `effectiveEndTime`), the lesson-end sweep and `GET /attendance/:groupId/date/:date` (which returns the same two fields for the form) all read it, so a moved lesson is opened, shown and closed by one clock. Do not read `lessonStartTime` / `lessonEndTime` off the group for a per-day decision.
8. **New-register window (ADR-0054)** — a register with no rows yet is accepted only inside the window of `attendance/shared/attendance-window.ts` (`newAttendanceWindow`): the lesson's own Tashkent day, from the company's lead (`opensMinutesBefore`, item 7) before it starts until it ends (end minute closed), for EVERY role, the CEO included; a group without lesson times has no opening time and closes at 23:00. The lead moves only the opening: `lessonHasEnded` and the lesson-end sweep do not read it. One guard, `assertAttendanceWindowOpen` (`attendance/shared/attendance-window-guard.ts`, its `times` — effective start, end and lead — are required), applies it — and also refuses once «Dars bo'ldimi?» has been asked for the lesson — in `AttendanceSaveService.save` (only when there are no rows yet, inside its transaction), `QrAttendanceSessionService.startSession` and `QrAttendanceScanService.scanQr`. Where it would say the lesson has ended, a teacher-only caller (`save()`, and QR start from the caller's roles) reads `TEACHER_ENDED_REFUSAL` «Dars tugagan — davomat olish yopilgan. Dars bo'lgan-bo'lmaganini administrator belgilaydi.» instead of `ENDED_REFUSAL`, and a student's QR scan (`student`) reads `STUDENT_ENDED_REFUSAL` «Dars tugagan — QR bilan davomat yopilgan. Darsda bo'lgan bo'lsangiz, administratorga ayting.»; the «… daqiqa oldin ochiladi» and future-day texts are the same for everyone. After the lesson the only way in is `POST /attendance/:groupId/date/:date/late` («Bo'ldi», below). Editing a register that exists stays open to CEO/BD/Administrator after the lesson too (CEO, 30.09); a teacher-only caller is refused once the lesson has any row. Planned absences are not a register: they pass `validateLessonDate` and then `assertLessonNotEnded` (allowed until the lesson ends, 23:00 for a group without times)

#### QR Session

- Redis-backed session with token rotation every 45 seconds
- Session TTL = `min(remainingTimeUntilLessonEnd, 2 hours)` — auto-expires when lesson ends. The remaining time counts down to the lesson's effective end on the **Tashkent** clock (`secondsUntil`), never `setHours` in the process timezone (UTC on Railway), which could let a session outlive the lesson by up to the 2-hour cap
- `rotateToken()` preserves remaining TTL instead of resetting to 2 hours
- Lesson number is computed once in `startSession()` and cached in Redis — `scanQr()` reads from cache
- **`startSession` and `scanQr` both use the shared guard** (`assertAttendanceWindowOpen`, ADR-0054) with the lesson's times read from the DATABASE: every scan calls `validateLessonDate` again (effective times, lead) before the guard, so a scan after the lesson ended — or once «Dars bo'ldimi?» has been asked — is refused even while the session or its last token is still alive, and a lesson moved since the session started is judged by its new times. The session stores no times. This closed the 50 s gap of ADR-0054's first release: the last token outlives the session by up to `TOKEN_TTL` (50 s), and a scan in those seconds used to skip the time check and could write a lesson's first register after its end. Cost: about seven queries per scan
- A scan then applies contract 3.2 (see «Admission» below) and reads the session only for `lessonNumber`. A scan that turns a LATE row into PRESENT clears its `lateMinutes`

#### Concurrency

- `save()` wraps enrollment validation + existing record reads + upserts in `prisma.$transaction()` (Serializable) to prevent race conditions
- **A lesson is never both marked and asked (ADR-0054).** A NEW register checks «Dars bo'ldimi?» inside that Serializable transaction; the lesson-end sweep opens the question in a Serializable transaction that reads attendance (`UnmarkedLessonsService.openOne`). Whichever commits second aborts, so a register saved at the instant the lesson ends cannot coexist with a question for the same lesson. The exception is a QR scan: it checks the question before its own transaction, so a scan that passed the check just before the end and writes after the sweep opened the question leaves both (the teacher is still unpaid; cancelling or moving the lesson closes it, «Bo'ldi» gets 400 — spec §3.1)
- **A lost race is a 409, never a raw 500 and never retried silently.** `common/transaction-conflict.ts` is the one reader of a conflict (`isTransactionConflict`: `P2034`, or a deadlock the pg adapter reports as `cause.code === '40P01'`) and `rethrowAsConflict` turns it into 409 «Bir vaqtda boshqa o'zgarish bo'ldi — qayta urinib ko'ring». It wraps attendance `save` / `saveLate`, `POST …/not-held`, lesson cancellation create/remove, lesson reschedule create/update/remove, a student's removal from a group (`removeFromGroup`) and the payment writes (`PaymentsWriteService`: manual create, reverse, a method-only correction, and an attached external payment — `createFromExternal` without an outer transaction). Payme and Click pass their own transaction and answer every error with their provider's code, so a conflict there reaches the gateway unchanged. On the cancellation and reschedule paths `{ duplicate: true }` maps a unique violation (`P2002`) to the same 409: each checks its unique rows inside the transaction first, so there a violation can only be a concurrent duplicate. Do not pass `duplicate` on a path where a `P2002` could mean a bug

#### Full-Roster Requirement (`save()`)

- **Manual attendance is all-or-nothing.** `AttendanceSaveService.save()` rejects the request unless `dto.entries` covers every active enrollment the role would render via `getByDate` — partial saves are not allowed. A previous bug let admins/teachers leave students "na bor — na yo'q": only the marked subset was persisted and the rest stayed `null` forever.
- "Expected" set per role (must mirror `getByDate` exactly):
  - **Every role** (Teacher, Admin, BD, CEO) — every active enrollment in the group, debtors included, minus the students contract 3.2 keeps out of the lesson (see «Admission» below; they may be left unmarked). Debtors used to be hidden from the teacher view; that block was removed when retroactive billing on payment shipped, so the roster is the same shape for everyone now.
- On miss → `BadRequestException("Davomat saqlash uchun barcha o'quvchilarning holati belgilanishi shart. Belgilanmagan o'quvchilar: N ta")`. Validation runs **inside** the `Serializable` tx, so a concurrent enrollment add can't race past it.
- The frontend (`attendance-form.tsx`) mirrors this: the `Saqlash` button is disabled while any student it may mark (`markableStudents`: blocked students left out) has `status === null` or nothing is marked at all, an amber "Belgilanmagan: N ta" badge sits next to it, and `handleSave()` no longer auto-coerces `null → "PRESENT"`. Both layers must stay in sync — never weaken the backend check thinking the UI already prevents the case (API is callable directly).

#### Admission (contract 3.2, ADR-0047)

- From 01.10.2026 (`ADMISSION_START_DAY`), in a monthly course, a student is kept out of a lesson from the month's 2nd lesson on while `balance + value of the month's lessons after that day < 0` (`lessonAdmission`, `billing/lesson-admission.ts`). A payment promise never lets anyone in; a month whose charge is not written yet is not judged. `LessonAdmissionService.forLesson({ groupId, lessonDay, studentIds }, tx?)` is the one reader; a student missing from its map is admitted. Never compute admission anywhere else.
- It holds in every register: `save()`, `saveLate()` («Bo'ldi» — CEO decision of 30.09) and the QR scan. `GET /attendance/:groupId/date/:date` returns `activeStudents[].admission` on the live roster and on the `late=1` roster alike.
- **An edit after the lesson keeps the lesson's own verdict** (`leftOutAfterEnd`, `attendance/shared/attendance-window.ts`), for lessons from 01.10.2026 (older registers were saved under rules that let a present student go without a row). A manual save marks every student it may, so a roster student who was already in the group when a manual save first took the register (`Enrollment.createdAt` before the earliest MANUAL row's `createdAt`) and still has no row was kept out at the time (unpaid). After the end he stays out, whatever he has paid since: `save()` does not require him and refuses PRESENT, LATE and ABSENT with «{name} dars vaqtida davomatga kiritilmagan: dars tugagach «Keldi», «Kelmadi» yoki «Kechikdi» qo'yib bo'lmaydi» (EXCUSED is allowed), and `GET` returns his admission as `LEFT_OUT` (a locked row with no payment prompt). Without it, an edit forced a mark on a student who paid after the lesson, and the teacher was paid for a student he had been told earns him nothing. A student enrolled after that save is new, not left out: adding him after the lesson is the correction D1 was decided for (the CEO's example: a new student added ten minutes after the lesson), and the normal admission judges him. A register only QR scans took still needs everyone, and «Bo'ldi» judges by the payments as they stand now (a student who has paid since is admitted).
- **A later month's charge counts as still held.** `forLesson` reads the student's charges from the lesson's month on (`lessonAdmission`'s `laterCharges`): the balance already carries November's charge, so a «Bo'ldi» or an edit on 02.11 for an October lesson judges October alone. A later month counts at its `chargedAmount` (`heldLater`), not at its lessons' rounded prices, which can fall a few so'm short (450 000 over 13 lessons) and would block the month's last lesson. The lesson's month alone decides the first lesson and `paidThrough`; `firstLessonCoverage` reads later months the same way.
- For a blocked student PRESENT, LATE and ABSENT are refused with «{name} to'lov qilmagan: shartnomaga ko'ra 2-darsdan boshlab to'lov qilinmaguncha darsga qo'yilmaydi» (the scan: «To'lov qilinmagan: shartnomaga ko'ra 2-darsdan boshlab to'lov qilinmaguncha darsga qo'yilmaysiz»), nothing written. EXCUSED is allowed, leaving him out is allowed (the full-roster check skips him), and a mark that does not change is not judged again.
- Order inside `save()`'s Serializable transaction: roster (with names) → admission (read with `tx`) → existing rows → full roster (blocked and left-out students skipped) → teacher lock → the window guard (new register only) → `assertAdmitted` → write — so a lesson that has ended reports "ended", not "unpaid". `saveLate()` judges that day's roster (`rosterOnDate`) inside its transaction and reads a student's name only when refusing. The scan judges after the guard.
- The read happens inside the Serializable save, over the roster's balances and month charges, so a payment for one of those students that commits mid-save can make the save lose with 409 («Bir vaqtda…»), and a payment that loses to the save gets the same 409. By design; watch it on busy lessons.
- **Kill switch:** `payment.admissionRuleEnabled` (company-level, CEO only, default on). Off: `forLesson` blocks nobody and the payment dialog shows no reach — no deploy needed. The debtor's-first-lesson rule (ADR-0048 §4, below) does not read it.
- **At least half of the month (ADR-0064), lessons from 01.11.2026 (`MIN_SHARE_START_DAY`).** From a group's 2nd lesson the student must also have paid `payment.admissionMinPaidPercent` (0–100, default 50, company-level, CEO only; 0 = the rule above alone) of that month's charge. `heldForAdmission` replaces `heldAfter` in the reach: of each charge, from its own 2nd lesson, at most `chargedAmount − ceil(chargedAmount × percent / 100)` counts as still held, so every charge is asked for `max(its lessons through the day, its least share)`. **Each group's share starts at that group's own 2nd lesson and the needs add up; the balance is never split between groups** (CEO, 02.10.2026) — a student of two 450 000 groups who paid 225 000 is admitted to neither. A month split by a transfer or a rejoin is judged whole: `closedThisMonth` (what the month's charges on enrollments since closed kept) joins the active charges and the share is taken of the total — taken of the new charge alone, a student who paid two thirds of the month was kept out after moving group. The verdict's reason is `BELOW_MIN_SHARE` (with `minPaidPercent`) when the share asks for more than the lessons held, `NOT_PAID` otherwise; `PaymentReach.next.minPaidPercent` says the same to the payment dialog, and `MonthlyPreview.minShareDue` is its «Kamida 50%» quick amount. `firstLessonCoverage` and `heldAfter` themselves do not change: teacher pay never reads the share. `assertAdmitted`'s refusal text is the same for both reasons (the row is locked in the UI); the QR scan names the share.
- **Known limits (documented, not fixed):**
  - A register only QR scans took is not covered by `leftOutAfterEnd`: a student the scan refused (unpaid) who pays after the lesson must be marked by the first manual save after the end, and PRESENT or ABSENT then pays the teacher for him.
  - The kill switch does not reopen a left-out student: switched off, nobody is blocked from then on, but a student an ended register left out can still be marked only «Sababli».
  - `forLesson` reads only ACTIVE enrollments' charges, so a student who left the group after the lesson day is not checked inside «Bo'ldi»: he is admitted without the rule.
  - A lesson whose every student is blocked cannot be saved live in practice: a blocked row takes only «Sababli» and the form's Save needs one mark. Its «Dars bo'ldimi?» question opens at the end, and «Berilmadi» then prices the lesson over every student whose month charge covers the day, blocked ones included, so it overstates what the teacher lost. SPEC27 (`docs/superpowers/specs/2026-09-27-davomat-va-tolov-tartibi-design.md`) said blocked students should be left out of «Berilmadi»; the same overstatement applies to any missed lesson with a blocked student.

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

- `AttendanceReminderService` (`src/attendance/attendance-reminder.service.ts`) — `@Cron('0 0,30 7-22 * * 1-6', { timeZone: 'Asia/Tashkent' })` (every 30 min, 07:00–22:30, Mon–Sat) fires six lesson-attendance notifications. Every tick first runs the lesson-end sweep (`sweepEndedLessons`), and `closeDay` (`@Cron('0 0 23 * * *')`, every day, Sundays included) runs it once more for whatever the ticks missed — see «Dars bo'ldimi?» below
- `AttendanceEventsListener` (`src/attendance/attendance-events.listener.ts`) — handles the `attendance.completed` event emitted from `AttendanceService.save()` on the first save of the day
- **Triggers:**

  | #   | When                                                        | Attendance taken? | Recipient               | NotificationType                                            |
  | --- | ----------------------------------------------------------- | ----------------- | ----------------------- | ----------------------------------------------------------- |
  | 1   | `lessonStartTime`                                           | —                 | Teacher                 | `LESSON_STARTED`                                            |
  | 2   | `lessonEndTime - 30 min`                                    | ❌                 | Branch Administrator(s) | `ATTENDANCE_ADMIN_ALERT`                                    |
  | 3   | `lessonEndTime - 30 min`                                    | ❌                 | Teacher                 | `ATTENDANCE_TEACHER_WARNING`                                |
  | 4   | When the lesson-end sweep opens the question (any end time) | ❌                 | Teacher                 | `ATTENDANCE_MISSING_TEACHER`                                |
  | 5   | When the lesson-end sweep opens the question (any end time) | ❌                 | Branch Administrator(s) | `ATTENDANCE_MISSING_ADMIN`                                  |
  | 6   | On first `save()` of the day                                | ✅                 | Teacher                 | `ATTENDANCE_COMPLETED` (stats: present/absent/late/excused) |

- **#2's text (CEO, 01.10.2026):** title «O'qituvchi hali davomat olmadi», body «👀 Dars tugashiga 30 daqiqa qoldi, o'qituvchi hali davomat olmadi» + the lesson's details + «Dars tugaguncha davomat olinmasa, ustozga bu dars uchun haq yozilmaydi. Iltimos, o'qituvchini ogohlantiring.» It replaced «O'qituvchiga eslatib qo'ying…»; do not promise the administrator that taking it keeps the teacher's pay (the CEO struck «siz olsangiz, ustoz haqi saqlanib qoladi»). #3 tells the teacher «Davomat dars tugaguncha olinmasa, bu dars uchun haq yozilmaydi.»
- **Idempotency (no new DB table):** each trigger checks `Notification` for an existing row with the same `(userId, type, relatedEntityType='Group', relatedEntityId=groupId)` created today (Tashkent day). If found → skip. If not → send + insert (the inserted row becomes the idempotency marker for the rest of the day)
- **Auto-stop:** once the teacher marks attendance, triggers 2–3 short-circuit because `attendance.findFirst` returns a row (they run at end − 30 min, so a lesson marked in time never gets them). Triggers 4–5 are not time triggers at all: the sweep sends them once, in the same pass that opens the lesson's «Dars bo'ldimi?» question, and it opens it only for a lesson with no register. No cancellation of already-queued notifications is needed
- **Recipients:** `ATTENDANCE_ADMIN_ALERT` / `ATTENDANCE_MISSING_ADMIN` filter users by `roles.role.name = 'Administrator'` AND `branches.branchId = group.branchId`. Branch Directors are NOT included
- **Delivery:** all 6 notifications fan out to the 4 channels (DB + SSE + Web Push + Telegram); the reminders (#1–#5) are sent instantly, while #6's Telegram leg goes through the 20:00 digest (see "Telegram digest" below). Push payloads set `url = /groups/<groupId>`; Telegram messages include plain-text portal URLs (`https://lehrer.dafzentrum.uz` for teachers, `https://admin.dafzentrum.uz` for admins) which Telegram auto-linkifies
- **Skip conditions (cron tick):** group must be `ACTIVE`, not soft-deleted, within `startDate`–`endDate`, today must be in `exactDays`, and the date must not be a `Holiday` **of the group's branch** (`findActiveHolidayCovering(date, branchId)`, looked up once per branch per tick — one branch's holiday never silences another branch's lessons; the sweep applies the same per-branch rule)
- **Recipient filter (status, isActive, deletedAt):** every notification query that loads `User` recipients (teachers via `Group.teachers`, branch admins via `prisma.user.findMany`, attendance-completed listener, etc.) **must** filter by `deletedAt: null` AND `isActive: true` AND `status: UserStatus.ACTIVE`. Missing any of these three conditions means deactivated, suspended, terminated, or archived users keep receiving notifications — a real bug we have already hit. Defense-in-depth requires all three, even though `UsersService.updateUser()` keeps `isActive` and `status` in sync

#### Unmarked lessons — «Dars bo'ldimi?» (ADR-0054)

- `UnmarkedLesson` = "nobody marked this lesson before it ended": one row per `(groupId, date)`, status `PENDING → HELD | NOT_HELD | RESCHEDULED`. Opened by `AttendanceReminderService` (`sweepEndedLessons`: every :00/:30 tick, Mon–Sat, and the 23:00 `closeDay` run — the only one on Sundays) through `UnmarkedLessonsService.openForEndedLessons`. It opens each row in its own Serializable transaction that READS attendance, so a register saved at the same moment conflicts and one side aborts; the same transaction re-reads the day's live cancellation and moves (`lessonDayTakenAway`, `unmarked-lessons/answer-rules.ts`), because the sweep loads them before it and one committed in between would leave a question on a cancelled or moved-away day; one failing lesson is logged and does not stop the rest. Only ACTIVE, non-deleted groups are asked. Lesson days come from `attendance/shared/ended-lessons.ts` (`endedLessonsOn`: schedule, moves, cancellations, the group's branch's holidays). History: `DAVOMAT_OLINMADI` on the Group when it opens.
- Each row gets a system task (`Comment` with `isSystem`, `isTask`, `authorId: null`, written straight to the table by `createLessonTask`) for the branch's administrators (fallback: directors, then CEOs), due the next working day 10:00 Tashkent — Sundays AND the branch's holidays skipped, for a re-asked task too (`unmarked-lessons/lesson-task.ts`, `reask-holidays.ts`). `TaskReminderService` reminds the holder at 09:00. Its holiday check ignores the branch, but `Holiday.date`/`endDate` are UTC midnight and it passes `new Date()` (04:00Z at 09:00 Tashkent), so it skips only the non-final days of a multi-day holiday; on a one-day holiday, or a holiday's last day, it still runs. A task due on a non-final day of ANOTHER branch's multi-day holiday therefore gets no reminder. **`Comment.authorId` is nullable now:** anything that reads `comment.author.*` must handle `null` («Tizim» in the UI and in the reminder text; `task.status.changed` is skipped for an author-less task).
- **Taking the task.** The first administrator to change its status or to answer takes it: `claimSystemTask` deletes the others' `CommentAssignee` copies and records `UnmarkedLesson.claimedById`, in a Serializable transaction that locks the lesson row first. The loser gets 409 — a serialization conflict (`P2034`) or a Postgres deadlock (`40P01`, which the pg adapter reports without a Prisma code; `isTransactionConflict` reads `cause.code`). Whoever answers is recorded as the holder even without having pressed «Ko'rdim» (`closeLessonTask`); after that another administrator's status change gets 409 «Bu topshiriqni … oldi» and `POST …/late` / `…/not-held` get 409 (`assertMayAnswer`); the CEO and Branch Director may always answer. A plain cancellation or move from the group page does NOT check the holder (any Administrator may make one, and it answers «Bo'lmadi»). `DONE` only by answering: moving a system task to `DONE` is refused (400) and so is moving a `DONE` copy back (an answered question stays closed); system tasks cannot be edited or deleted (400); no `task.assigned` notification. A deleted group's PENDING tasks are closed (`closeTasksOfDeletedGroup`); the rows stay, unpaid.
- «Bo'ldi» = `POST /attendance/:groupId/date/:date/late` (`AttendanceSaveService.saveLate`; CEO / Branch Director / Administrator, branch-checked — a teacher gets 403): the date must be a real calendar day (`isCalendarDateStr`, 400 otherwise — `…/not-held` too); a cancellation or move made after the question opened has already set the row to NOT_HELD / RESCHEDULED in its own transaction, so «Bo'ldi» then gets 404 «Javob kutilayotgan dars topilmadi» (`findPendingUnmarkedLesson`), or 409 when the two collide; the 400 from `lessonDayTakenAway` is only a backstop for a PENDING row left on a cancelled or moved-away day — without it «Bo'ldi» would refund an excused student twice or bill a cancelled lesson; the roster is who was in the group THAT day (`attendance/shared/roster-on-date.ts`, also served by `GET …/date/:date?late=1`), not who is active now; the row goes to HELD BEFORE any billing, the task closes, `attendance.completed` is NOT emitted (it thanks the teacher for a register taken on time), and `unmarked-lesson.held` tells the teacher the lesson earned nothing (notification + push now, Telegram in the 20:00 digest as `LESSON_PAY_FORFEITED`; nothing for an exempt lesson). History: `DAVOMAT_KECH_KIRITILDI`, whose `ustozHaqi` says «yoziladi (CEO istisnosi)» only when the CEO exempts in that request, «yoziladi (<the row's exemptReason>)» for a row that was already exempt, «yozilmaydi» otherwise. A student who has since left (enrollment no longer ACTIVE) is on the register but takes NO money in a non-MONTHLY course — closing their enrollment already refunded the prepaid lessons, so billing would take a whole cycle from a departed student and strand it — and so writes no live teacher accrual either (on an EXEMPT lesson the payroll centre top-up, `sweepGapLessons`, still fronts it: the attendance row exists and nothing covers it; no active pack groups today); MONTHLY courses bill as before (monthly attendance moves no balance), except a departed student whose month a trial lesson gave back (`trialMonthStudents`, the substitute override's rule too — see «A substitute override keeps a trial lesson unpaid»: the day is in `frozenOutDates`) — billing it would pay the teacher, exempt or not, for a trial nobody pays for; the payroll top-up's new-student gate never fronts a trial student either. A quality claim also returns the whole month but keeps the teacher's pay (ADR-0043 §8), so that student is billed; the refund's ledger row (`metadata.kind = 'monthly-release'`, `policy`, `trialLesson`) tells the two apart, and a month that refunded nothing (no row) is taken for a trial.
- «Bo'lmadi» = `POST …/not-held` → `LessonCancellationsService.create` (money back, ADR-0053) or `LessonReschedulesService.create` (a make-up lesson that must still be ahead of now, `assertMakeUpAhead`; no money moves). Their OWN transactions answer the row (`unmarked-lessons/unmarked-lesson-transitions.ts`), so a cancellation or move made on the group page answers the question too, and only then does `unmarked-lesson.not-held` send the Telegram group notice AT ONCE (admin bot, approved groups whose branch it is by `isVisibleToGroup`, `TelegramGroupUnmarkedLessonListener` — an addition to ADR-0025's instant list, recorded in ADR-0054; a plain pre-lesson cancellation or move has no question and sends nothing). A lesson already answered «Bo'ldi» cannot be moved (400). Known race: `answerNotHeld` checks PENDING and the holder OUTSIDE the cancellation's transaction, and `markUnmarkedLessonCancelled` accepts a HELD row (so a wrong «Bo'ldi» can be cancelled later) — a «Bo'ldi» that commits in between is cancelled (EXCUSED, refund, NOT_HELD, group notice) instead of the «Bo'lmadi» getting 404/409; the move path refuses HELD with 400.
- **Re-asking.** Deleting the cancellation or the move that answered a question puts the row back to PENDING with a new task (due date skips the branch's holidays: `loadReaskHolidays`, read before the Serializable transaction opens) — unless the day already has attendance (a lesson answered «Bo'ldi» and then cancelled keeps its EXCUSED rows, and «Bo'ldi» would be refused for ever): then the row stays as it is. Deleting a move re-asks nothing at all when its make-up lesson already took place on the new date — a register there, or a HELD row («Bo'ldi» writes no register when that day's roster is empty; `makeUpLessonHeld`) — «Bo'ldi» on the original day would bill the one lesson twice. If no row ever existed, the removal after the original lesson ended — no register, no question — opens a first-time question (`openFirstTimeQuestion`). It is EXEMPT, with reason «Dars bekor qilingan edi — ustoz davomat kirita olmagan» or «Dars oldindan ko'chirilgan edi», only when the removed cancellation/move was created (`createdAt`) BEFORE the lesson's effective end on the Tashkent clock — the teacher could not mark it then. Created at or after the end, it opens a normal, non-exempt question with no reason: otherwise cancel-then-delete right after a lesson would grant pay only the CEO may grant (CEO ruling 2026-09-30). For a move, a holiday or a still-cancelled original day is never asked (`originalDayIsClosed`). A removed CANCELLATION has no such guard, and creating a move does not refuse a cancelled original date: cancel D, move D→D', delete the cancellation after D ends — D gets a PENDING question that no answer can close (all three refuse with 400) until the move is deleted; a holiday is not checked either (known gap, spec §3.5). A day that is itself another live move's new date uses that move's times, for "has it ended" and for the exemption alike.
- **The make-up day's own question.** A move makes its new date a lesson day, so the sweep asks about that day too when it ends unmarked. `LessonReschedulesService.remove()`, and `update()` when the date changes, call `closeQuestionOnFormerMakeUpDay` (`unmarked-lessons/make-up-day.ts`) inside their Serializable transaction, after the move row is written: it re-checks the old make-up day with the sweep's own rule (`lessonsOn` in `attendance/shared/ended-lessons.ts`: schedule, live moves, cancellation, the branch's holidays, the group's dates) and, if that day no longer has a lesson, sets a PENDING row there to NOT_HELD with no `cancellationId` / `rescheduleId`, decided by whoever changed the move, and closes its task — no group notice, `teacherPayExempt` untouched. Left open, «Bo'ldi» there plus the re-asked original day would count one lesson twice. For the same reason `update()`, when the date changes, runs `assertMakeUpMayMove` (`unmarked-lesson-transitions.ts`): a make-up lesson that already took place (a standing register — rows of a cancelled make-up day or rows carrying `cancellationId` do not count — or a HELD row) → 400 «Qo'shimcha dars kunida davomat olingan — ko'chirishning sanasini o'zgartirib bo'lmaydi»; a make-up day whose question is still PENDING → the new date/start must be ahead of now (`assertMakeUpAhead`). A reason/room-only edit never reaches these checks. `saveLate` and «Bo'lmadi → Ko'chirish» (`answerNotHeld`) refuse a day that was not a lesson day (`noLessonScheduled`, read inside the saveLate transaction): not a current weekday, not a weekday of the schedule in force that day (`buildScheduleDayResolver(scheduleSnapshots, exactDays)`, as the group calendar does; a day before the recorded history is accepted), and no live move's new date → 400 «Bu kunda dars rejalashtirilmagan». That guard deliberately skips holidays and the group's dates: questions can exist on a holiday (see «Re-asking») and «Bo'ldi» must work after a group ends. Known gaps: the cancellation service (`LessonCancellationsService.create`) still checks only the CURRENT weekdays, so «Bo'lmadi → Bekor qilish» refuses a question opened under an older schedule («Bo'ldi» / «Ko'chirish» answer it); the resolver gives the whole day of a weekday change to the NEW schedule, so a question on that very day is refused by all three answers; chained moves (a make-up moved on through «Ko'chirish», then the first move deleted) re-ask the original day while the second make-up stands.
- **Answer reasons are trimmed before validation.** `NotHeldDto.reason` and `LateAttendanceDto.exemptReason` carry a trimming `@Transform` ahead of `@IsNotEmpty`, so a reason of spaces gets 400 «Sababini yozing» and the service receives the trimmed text (the global `ValidationPipe` runs with `transform: true`). The group page's plain `CreateLessonCancellationDto.reason` still accepts spaces (known gap).
- **Teacher pay:** a row with `teacherPayExempt = false` ⇒ no `SalaryAccrual` for that `(groupId, date)`, ever, whatever the row's status. Two locks: `createAccrual` (`isLessonPayForfeited`) and `sweepGapLessons`' required `forfeitedLessons` (loaded with `loadForfeitedLessonKeys`; a `GapSweepInput` field nobody can forget). Do not add a third path that writes accruals or forecasts pay from attendance without one of them. Only the CEO may exempt (`teacherPayExempt` + `exemptReason` on the late register, the role read from the DATABASE — ADR-0028, 403 otherwise); rows opened by the backfill script are exempt, and so are first-time re-asks whose cancellation/move predates the lesson's end (see «Re-asking»).
- Revenue needs nothing: «Bo'ldi» writes attendance, `valueHeldLessons` finds it.
- **Read side.** `GET /dashboard/today-schedule` and the group calendar (`GET /attendance/:groupId/calendar`) carry `unmarked: { id, status, teacherPayExempt, lessonStartTime, lessonEndTime, claimedBy } | null` per lesson (`loadUnmarkedLessonInfos`). The 21:00 group report adds «Javobsiz darslar (1 kundan ortiq)» — PENDING rows whose `createdAt` is older than 24 hours (a re-asked row keeps its first `createdAt`, so it can count the same evening it is re-asked), deleted groups excluded, the report's branch scope — to its «Diqqat» flags; because it is a flag it turns the day's light 🟡.
- **Backfill:** `scripts/open-unmarked-lessons.ts` opens the question, exempt (reason «Qoida kuchga kirishidan oldingi dars (ADR-0054)»), for past unmarked lessons of ACTIVE groups since `--from` (default 2026-09-01). It is a dry run by default on a read-only connection (checked, else it stops) and lists every lesson; `--apply` needs `--expect=<N>` — the count the dry run printed — and aborts before writing if a fresh scan differs; unknown flags are refused; a failed lesson is logged, the run continues and exits non-zero, and a repeat skips the ones already opened.

#### ADR-0048 — «Berilmadi», late minutes, trial lesson, a debtor's first lesson

- **«Berilmadi»** (`SalaryMissedLessonsService.forTeacher` → the pure `salary/shared/missed-lessons.ts`; `getMonthlyForUser`'s `missedLessons`, the teacher's salary panel) is computed on read, never stored: from 01.10.2026, the planned lessons of the teacher's groups before today. A lesson is missed when it has no register **or** a non-exempt «Dars bo'ldimi?» row — its pay was forfeited, «Bo'ldi» included (ADR-0054); an exempt row is never missed, register or not. A lesson a substitute override gave to other teachers is not this teacher's to miss. The amount is what the lesson would have accrued over every student whose month charge covers the day (not frozen out, not pre-marked «Sababli»); see the blocked-student limit under «Admission».
- **Late minutes** (`Attendance.lateMinutes`, nullable; migration `20261002100000_attendance_late_minutes`, `ADD COLUMN IF NOT EXISTS`). `lateArrival` / `minutesLate` (`attendance/shared/attendance-window.ts`) decide them in `writeEntries`: a non-teacher's manual save **while the lesson runs** (`newAttendanceWindow` is `OPEN`), on a lesson whose register a MANUAL save already took (an existing row with `markedMethod === 'MANUAL'`; QR rows do not count, so the administrator's first roster after QR scans goes in as sent), that moves a student from not-in-lesson to PRESENT/LATE writes LATE with the minutes since the effective start. LATE → LATE keeps the minutes; any other status clears them, and so do a QR scan to PRESENT and every write that flips the row to EXCUSED (a cancellation, a move, a freeze's attended-lesson override). «Bo'ldi» and an edit after the end write the status as sent, with no minutes. History counts the written statuses; `attendance.completed` counts what was sent. The client only shows «N daqiqa kechikdi».
- **Trial lesson (contract 3.5):** from 01.10.2026, a student removed or expelled who came to at most one lesson in all groups (PRESENT/LATE; ABSENT does not count) gets the month back in full, whatever departure policy was picked, and the teacher's accruals for that month in that group are reversed (a month already settled by payroll keeps what it paid). A month that refunds nothing (a 100% discount, a month the excused credit paid) is released all the same — its days go to `frozenOutDates` and the accruals are reversed. `trialLessonApplies` / `policyRelease` (`billing/departure-policy.ts`) decide it; freezes, transfers and the centre's closings are not departures here.
- **A trial lesson waits for «Dars bo'ldimi?» (ADR-0060).** A PENDING question on a day the student was on the roster (`rosterOnDate`; a deleted group's questions never close and are skipped; a lesson his own row already answers — ADR-0054's QR race leaves a row and a question — is not waiting) is either lesson. When its answer could decide the trial — at most one PRESENT/LATE, more than one with the pending ones — `trialLessonVerdict` lists it and the removal and the expulsion are refused with `trialAwaitsAnswerText` («Avval «Dars bo'ldimi?» savoliga javob bering: 05.10 (#014). …»), only when the departure settles a CHARGED month (`assertTrialLessonAnswered`, which counts that month first). Both check before writing anything, after the caller's access check: `removeFromGroup` just before its transaction, on the departure's own day; the expulsion in `applyStatusChange`, before the status changes — its cascade only logs a failed money step. The dialogs show the same words (`trialAwaitsAnswer` on the preview). A question opened after the check is not a trial: `reverseChargeForDeparture` keeps the ordinary rule. Known limit: a trial departure whose month has no CHARGED charge (reversed or never written) settles nothing, so its centre-funded accruals stay.
- **A substitute override keeps a trial lesson unpaid.** An override on a past lesson re-accrues it for the teachers it adds (`LessonTeacherOverridesService.recomputeAccruals`), and `findChargeForLesson` ignores `frozenOutDates`, so it skips the students `trialMonthStudents` (`billing/trial-month.ts`; «Bo'ldi» uses it too) returns: a departed (non-ACTIVE) enrollment still in the group that day (`statusChangedAt` on or after it, `rosterOnDate`'s rule) whose CHARGED month has the lesson day frozen out. An enrollment that left earlier does not count: an ordinary departure freezes out the days after it, and a student put back into the group the same month pays for those days on the new enrollment. Nothing accrues for the added teacher, and the payroll top-up never fronts the lesson (its new-student gate). A quality claim gives the month back too but keeps the teacher's pay (ADR-0044): its refund row (`monthly-release`, `policy: 'QUALITY_CLAIM'`) exempts the month, and any other month given back counts as a trial. An ACTIVE enrollment is never skipped: a student unfrozen on a lesson day attends it free (`restoreChargeForReturn` leaves the return day frozen out) and the teacher is paid for it, live and through an override alike. Any other path that writes pay for a lesson already held must skip these students too.
- **A debtor's first lesson:** from 01.10.2026, in a monthly course, an ABSENT at the student's first lesson of the month in a group that their payments do not reach (`firstLessonCoverage`) accrues nothing. The payment that reaches it writes the accrual (`accrueDeferredFirstLessons` in `processRetroactiveBillingForStudent`, which skips forfeited lessons), and the centre never fronts it (`awaitsStudentPayment` in the gap sweep and the BR-09b backlog). A PRESENT first lesson accrues as usual, and ADR-0052 shows its unpaid share under «Markaz qo'shdi», shrinking as the student pays — which is why ADR-0049 (flag it `wasCenterTopUp`) was rejected.
  A substitute override re-accrues a held lesson for the teachers it adds, and removing one does the same for the group's own teachers (`LessonTeacherOverridesService.recomputeAccruals`); both skip a debtor's unpaid ABSENT first lesson through `LessonAdmissionService.isUnpaidFirstLesson`, the check the live path makes (`isDeferredFirstLesson`), and the payment that reaches it pays whoever teaches it then.
- **Three switches** on `/settings/payment`, company-level, CEO only: `payment.admissionRuleEnabled` (contract 3.2, default on), `payment.trialLessonEnabled` (3.5, default on) and `payment.attendanceOpensMinutesBefore` (the lead, 0–60, default 10). The start day (01.10.2026) and the one-lesson trial limit come from the contract and are not settings. ADR-0064 added two numbers beside them: `payment.admissionMinPaidPercent` (see «Admission») and `payment.paidThroughReminderDays` (contract 3.7's reminder, 0–10, default 3, 0 = none).

#### Per-Student Attendance Telegram Notifications

- **Currently disabled (temporary).** The listener is gated behind the `STUDENT_ATTENDANCE_NOTIFICATIONS_ENABLED` env flag and short-circuits unless it equals `'true'`. Default (unset) = no messages sent. Set `STUDENT_ATTENDANCE_NOTIFICATIONS_ENABLED=true` to re-enable without any code change. The behaviour described below applies only when the flag is on. **Do not turn it on while automatic pause is enabled** — its ABSENT message and the pause's stage-1 message (see "Automatic pause after consecutive absences") would both reach the student for the same lesson.
- `StudentAttendanceNotificationListener` (`src/attendance/student-attendance-notification.listener.ts`) sends a personal Telegram message to the **student themselves** whenever their attendance status changes to `PRESENT`, `LATE`, or `ABSENT`
- `EXCUSED` is intentionally skipped (no notification when an absence is officially excused)
- **Trigger:** `attendance.student.recorded` event emitted per-entry from both manual `AttendanceSaveService.save()` (post-tx, only for entries where `oldStatus !== newStatus` so idempotent re-saves don't spam) and `QrAttendanceScanService.scanQr()` (per scan, after the early-return for already-PRESENT)
- **Delivery:** Telegram only — uses `Student.telegramChatId` (populated when the student registers via the Telegram bot deep-link). Silently skips students without a chat ID. Telegram API failures are logged at `warn` and never break the attendance save
- **Re-emit on edit:** when an admin later corrects a status (e.g. `ABSENT → PRESENT`), a new message goes out — confirmed business behaviour, not a bug
- Messages are short Uzbek HTML directed at the student in second person ("Darsga keldingiz" / "Darsga kech keldingiz" / "Darsga kelmadingiz") with group name, date (`dd.MM.yyyy`), and `lessonStartTime` when available
- **«Dars: N / M» is counted per payment model.** LESSON_PACK: N is the student's attendance rows in the group up to and including the date, M the course's `lessonPaymentCount`. MONTHLY: inside the student's OWN month. The student's CHARGED `EnrollmentMonthlyCharge` for that group and month holds the lessons billed to them — `coveredDates` (stored ascending) minus `frozenOutDates` — so N is the date's place in that list and M its length, and a student who joined mid-month reads their own count, not the group's. When no CHARGED charge of that month holds the date (nothing was billed for the day, or the charge returned it as frozen out) the «Dars:» line is left out; the number is never guessed from the group's calendar. A student who left and rejoined the same group in one month has two charges, and the numbering is within the one that holds the date.

#### Advance / Pre-mark Absence (Oldindan davomat belgilash)

`PlannedAbsencesModule` (`src/planned-absences/`) lets an admin pre-mark a single student as not-coming **before** the lesson's attendance is taken (e.g. the student calls in the morning for an afternoon lesson).

- **Why a separate table, not an `Attendance` row:** a real attendance row would (a) bill the student (`ABSENT` is billable — "lesson held = lesson paid") for a lesson that hasn't happened, and (b) trip the teacher-once lock. `PlannedAbsence` is a side-table overlay (same family as `LessonCancellation` / `LessonReschedule`) so it never bills, never locks the teacher, and stays out of attendance stats. The absence-streak query does read it — see the last bullet.
- **Schema:** `PlannedAbsence { groupId, studentId, date, kind (PlannedAbsenceKind = SABABLI | SABABSIZ), note?, createdById, consumedAt?, companyId }`, unique `(groupId, studentId, date)`. Hard-deleted (it is intent, not a financial ledger row — no soft delete).
- **Endpoints** (`@Roles('CEO', 'Branch Director', 'Administrator')`): `POST /api/planned-absences/:groupId/date/:date` (upsert `{ studentId, kind, note? }` — `note` is **required** when `kind = SABABLI`, i.e. an excused absence must record _why_; the service trims it and rejects an empty reason) and `DELETE /api/planned-absences/:id` (only while `consumedAt IS NULL`). The service reuses `AttendanceValidationService.validateLessonDate` (no clock there) and then `assertLessonNotEnded` (a lesson that has ended is refused, 23:00 for a group without times), so today before the end and any future scheduled date both pass; it verifies an active/started enrollment, and rejects if attendance was already taken for that lesson.
- **Pre-fill:** `AttendanceReadService.getByDate` returns `plannedKind` / `plannedNote` / `plannedBy` / `plannedId` per student (the real `status` stays `null` — a pre-mark is not attendance). The attendance form seeds a pre-marked student as `EXCUSED` by default.
- **Consume:** `AttendanceSaveService.save` stamps `consumedAt` on the date's pending pre-marks inside the same Serializable transaction and writes an `Oldindan: sababli/sababsiz` marker onto the `EXCUSED` attendance note when the note is empty (teachers can't write notes themselves).
- **Billing is untouched.** A pre-mark never bills. On finalize both kinds default to `EXCUSED` (no charge); if the student actually shows up the teacher marks `PRESENT` and normal billing applies. **Streak:** a pre-announced `SABABSIZ` lands as `EXCUSED` but still counts toward the automatic-pause streak — `AbsenceStreakService` reads it back as `ABSENT`, otherwise a student could call ahead every time and never be paused. A `SABABLI` pre-mark breaks the streak like any `EXCUSED`. See "Automatic pause after consecutive absences" below.

#### Automatic pause after consecutive absences

Three or more consecutive unexcused absences freeze the student, which stops
the meter: they leave the attendance roster, so no lesson is billed and no
salary accrues. Measured on production over 90 days, 2 812 `ABSENT` lessons
cost 43,3 mln so'm of teacher salary — 7,7 mln of it fronted by the centre,
4,3 mln never recovered. See ADR-0023 for the decision and its numbers.

- **`AbsenceStreakService.computeStreaks` is the ONE definition of a streak.**
  Both the `/outreach` list and the cron read it; a second copy is how the
  list and the action would come to disagree. Three rules are NOT obvious and
  all three live INSIDE the raw SQL, before the `rn <= 10` window — outside it,
  a row being excluded would occupy one of the ten slots and hide a real
  attendance behind it:
  - **The counting window** (`streakWindowStart` = the later of
    `startDate ?? createdAt` and `statusChangedAt`). Reactivation resets the
    count. Without it the cron re-pauses a reactivated student the next
    morning — they have not reached a lesson yet, so the last three rows are
    still `ABSENT` — and the admin can never win that loop. It also stops a
    student re-enrolled into the same group from inheriting the old absences.
  - **A planned `SABABSIZ` absence counts**, even though it lands as `EXCUSED`.
    Otherwise a student calls ahead every time and escapes the rule forever.
    `SABABLI` (ill) still breaks the streak.
  - **A cancelled lesson (`cancellationId`) is invisible** — the centre
    cancelling a lesson is neither the student's fault nor a favour that
    washes their streak away.
- **The pause IS the existing student-level `FROZEN`**, run under a `system`
  actor (`StatusChangeActor`, ADR-0008's pattern). The system path skips the
  branch check and the reason list and writes `changedById = undefined`, so it
  knows **only** `ACTIVE → FROZEN`. Do not widen it. A student who is no longer
  `ACTIVE` when the cron reaches them is skipped silently — an admin may have
  removed them between the sweep and the write.
- **No enrollment-level pause exists, and none is needed.** One student holds
  at most one ACTIVE enrollment (`enrollToGroup` closes an existing one as
  `TRANSFERRED`); production has 449 active students and 449 active enrollments.
- **The daily cap is FAIL-CLOSED.** Over `dailyCap` candidates in one run,
  NOBODY is paused and every CEO is alerted. Do not "fix" this by pausing the
  first N — which N is arbitrary. Warnings are deliberately NOT capped.
- **`AbsenceWarningLog` is keyed `(enrollmentId, absenceDate)`** — one absence,
  one message. The cron runs daily while the streak does not change until the
  next lesson, so a per-day marker would re-send the same warning every
  morning. The table doubles as the record that answers "how many of the
  warned students came back?".
- **Two runs: the messages at 20:30, the pause at 07:30 (Tashkent).**
  `remindForCompany` (20:30) sends stages 1 and 2 on the lesson's own day,
  after the latest lesson ends at 20:00 — which is what lets stage 1 say
  «Bugun». `runForCompany` (07:30) pauses before the earliest lesson at 08:00,
  and also sends stages 1 and 2 for attendance entered after the evening run,
  naming the lesson's date instead. Both read `AbsenceWarningLog`, so nothing
  is sent twice. Measured on production (24.07–22.09.2026, 870 lessons): no
  lesson's attendance was last changed between 20:00 and 07:30, so the evening
  run misses no correction the morning run would see; 15 lessons were changed
  after the next 07:30, which neither run sees. **Do not move the messages to
  the moment attendance is saved:** 106 of those lessons were saved again
  later, 17% are marked at the start of the lesson (a late student would be
  told they missed the lesson they are sitting in), and a teacher cannot
  correct their own save.
- **`AbsencePauseSetting.enabled` defaults to `false`** — the migration pauses
  nobody by itself. Enabling is the CEO's separate, deliberate step, and
  disabling is a toggle rather than a deploy (in 2026-07 turning off automatic
  group closure required one).
- **The setting lives in its own module** (`AbsencePauseSettingModule`) so
  `OutreachModule` (which reads the threshold) and `AbsencePauseModule` (which
  reads `AbsenceStreakService` for the cron) do not form a cycle. `forwardRef`
  would hide the cycle; a small module removes it.
- `/outreach` gains a **"Pauzadagilar"** tab reading `GET /outreach/auto-paused`,
  which separates automatic freezes from the 209 manual ones by the reason
  prefix (`AUTO_PAUSE_REASON_PREFIX` — one constant, read by both the writer
  and the reader).

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
- **TransactionType**: `PAYMENT`, `LESSON_DEDUCTION`, `LESSON_CONSUMPTION`, `INITIAL_BALANCE`, `REFUND`, `SALARY_ACCRUAL`, `SALARY_PAYMENT`, `EXPENSE`, `ADJUSTMENT`, `TAX`, `BALANCE_WITHDRAWAL`, `DISCOUNT_ADJUSTMENT`, `MOCK_EXAM_FEE`, `DEBT_WRITE_OFF`
- **ContractStatus**: `DRAFT`, `ACTIVE`, `COMPLETED`, `CANCELLED`, `REFUNDED`
- **SalaryType**: `PERCENTAGE`, `FIXED_PER_STUDENT`, `FIXED_MONTHLY`
- **SalaryPaymentStatus**: `CALCULATED`, `APPROVED`, `PAID`, `CANCELLED`
- **RefundStatus**: `REQUESTED`, `APPROVED`, `PROCESSING`, `COMPLETED`, `REJECTED`
- **ExpenseCategory**: `RENT`, `UTILITIES`, `SUPPLIES`, `MARKETING`, `TEACHER_ADVANCE`, `EQUIPMENT`, `MAINTENANCE`, `TAXES`, `OTHER`

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
  - Reverse emits `payment.reversed` → `PaymentEventsListener` tells the student at once, on Telegram, that their payment was rolled back (ADR-0065)
  - **The receipt goes at once, for every payment (ADR-0065).** `payment.received` → `PaymentEventsListener` → `SmsService.sendToStudent` (writes the `SmsMessage` row), to any non-deleted student with a `telegramChatId`. `createFromExternal` emits it only when it owns the transaction; with an `outerTx` it returns `committed` instead, and the caller calls `PaymentsService.announceCommitted(committed)` after ITS commit — Payme and Click do. Until 02.10.2026 they did not, and no gateway payment got a receipt, a group-digest line or a carry-over notice. A new caller that passes its own transaction must do the same
  - `getPending()` uses `balance: { lt: 0 }` (strictly negative, not `lte`)

#### Salary Module (`src/salary/`)

- **Endpoints**: `GET/POST /salary/config`, `POST /salary/config/global`, `PATCH /salary/config/:id`, `GET /salary/accruals/:userId`, `GET /salary/payments`, `GET /salary/monthly` (CEO/BD — the month-selectable per-teacher report powering the `/payments/salary` page; BD branch-scoped), `GET /salary/monthly/user/:userId` (CEO/BD — the same report narrowed to one user), `GET /salary/monthly/center-topup` (CEO/BD/Admin/Cashier — the "Qolgan (markaz)" drill-down: which students the center is still owed by; read by the debt page's «Markaz qoplagani» tab, so it follows the debt page's open-read rule), `GET /salary/me/monthly` (any role the controller admits — CEO/BD/Admin/Teacher — their own row), `GET /salary/overview` (CEO/BD — paginated live per-teacher current-salary list, now used by the ⚙ Sozlamalar rate list; BD branch-scoped), `GET /salary/staff-config` (**CEO/BD only** — the non-teaching staff rate list behind ⚙ Sozlamalar → "Xodimlar stavkalari"; see below), `POST /salary/calculate` (CEO-only; **cron-internal — no manual UI trigger**), `PATCH /salary/payments/:id/approve` (CEO-only), `POST /salary/payments/:id/pay`, `POST /salary/payments/batch-pay`, `GET /salary/payments/settle-month/preview` (CEO-only), `POST /salary/payments/settle-month` (CEO-only)
- **`SalaryMonthlyService.getMonthly({ month?, search? })`** powers the `/payments/salary` monthly report — one row per teacher for a **selected month** (`YYYY-MM`, defaults to current, clamped up to `Company.systemStartDate`'s month, fallback `2026-05`). Resolves the month to a payroll period via `resolveCurrentPeriod(parseTashkentDateStart(`${month}-15`))` (with `cycleStartDay=1` this is the calendar month), then in **one bulk in-memory pass** over the month's billable attendances computes per teacher a **funder split** that does not depend on whether the month has been settled yet: `covered` (Σ non-reversed accruals **whose `wasCenterTopUp` is false** — the students-paid portion), `centerFunded` (Σ accruals the center funded **plus** Σ still-uncovered billable × rate active at `lessonDate`), `fullDeserved = covered + centerFunded`, `advances` (TEACHER_ADVANCE by `Expense.date` in the calendar month), and `netToPay`. **Settlement only moves money between the two terms of `centerFunded`** — an in-progress month carries the center's leg entirely as the forecast sweep, a settled month entirely as written accruals, and the totals match across the boundary. Summing EVERY accrual into `covered` (the shape before this) meant that the night the cron settled July, 15.5 mln so'm of the centre's own money was relabelled "o'quvchilar to'lagan" and the top-up column dropped to 0 on every surface. A **recovered** top-up stays on the centre's leg for the month it funded (the teacher was paid from centre money then; the pay-back is the separate X/Y/Z lifecycle below), which is why the split reads the sticky `wasCenterTopUp` and not `isCenterTopUp`. `hasLessonData` keys off the accrual TOTAL, not `covered`, so a month the centre funded end to end still renders its columns. The deserved math is the SAME as `scripts/forecast-full-salary-topup.ts`, ported into the shared pure helper `salary/shared/deserved-math.ts` (`perLessonAccrual` + `pickActiveVersion`) — NOT `SalaryAccrualService.findActiveVersion` (that is DB-per-call, wrong shape for a bulk sweep). **Manual/config-gap months (May — accruals never written because configs became effective in June)** have `hasLessonData=false` → `fullDeserved/covered/centerFunded = null` (rendered `—`); the columns are never fabricated from a proxy rate. **Net-to-pay** base is gated per month by `isTopUpMonth` (`salary/shared/topup.ts`, `TOPUP_EFFECTIVE_MONTH='2026-07'`): from July on it is `fullDeserved` (covered + centerFunded); earlier months stay on `covered`. **Since 2026-07 the cron ACTUALLY pays this** (not display-only) — `calculateMonthlySalaries` Phase 0 fronts every uncovered billable lesson with a center-funded `SalaryAccrual` (`isCenterTopUp=true`), so a top-up month's `SalaryPayment.amount` becomes the full deserved salary − advances and the shown `netToPay` for an unsettled top-up month equals what the cron will pay. Already-settled months show their real `payment.amount`. **Avans is never double-subtracted**: when a settled `SalaryPayment` exists, `netToPay = payment.amount` (already net of settled advances per the invariant); only unsettled months compute `base − advances`. **Center top-up lifecycle**: `getMonthly` also returns per-teacher `centerAdvanced` and totals `centerAdvanced` (X) / `centerStillFronted` (Z) / `centerRecovered` (Y = X − Z), computed from the accrual flags — advanced = Σ `wasCenterTopUp`, still-fronted = Σ `isCenterTopUp`. The `/payments/salary` view renders these as a company-level "Markaz qo'shimchasi — undirish holati" card below the table (shown only when `centerAdvanced > 0`, i.e. past settled top-up months; the per-teacher column is `centerFunded`, which is populated in BOTH phases); the Excel "Oyliklar" sheet appends the same X/Y/Z as a "Markaz qo'shimchasi — undirish holati" block (also gated on `centerAdvanced > 0`). **`SalaryAccrual.wasCenterTopUp`** is a STICKY companion to `isCenterTopUp`: set TRUE on any center-funded create, re-asserted TRUE on a gap-sweep re-run, and NEVER cleared (the recovery flip only touches `isCenterTopUp`), so recovered top-ups stay countable (`isCenterTopUp` alone loses that history). Backfill for pre-existing fronted rows: `scripts/backfill-center-topup-tracking.ts`.
  - **Monthly billing: the unpaid share of a charge is the centre's (ADR-0052).** A monthly charge is written whether or not the student can pay, so a debtor's lessons accrue as student-covered (`accrueMonthlySalary`: `centerFunded: !charge`) and September 2026 showed a 79 800 top-up against ≈14.6 mln of real exposure. `loadUnpaidMonthlyShare` (`salary/shared/unpaid-monthly-share.ts`) takes each accrual backed by a monthly charge (`deductionTransactionId` ∈ `EnrollmentMonthlyCharge.transactionId`), reads what is still unpaid of THAT charge from `replayDebtOrigin(...).leftById` (oldest charge settled first — the debt page's rule), and moves `amount × left / charged` from `covered` to `centerFunded`; the row and totals carry it as `centerUnpaidShare`. Live: it shrinks as students pay. `fullDeserved`, `netToPay`, the cron and the X/Y/Z lifecycle do not change — it only re-splits the two columns. Pack-backed and top-up accruals are never touched.
- **`SalaryCenterTopUpService`** answers "who is the center still owed by" behind the card's Z figure. It reads the SAME accruals over the SAME teacher roster as `getMonthly` (both build the clause from `shared/teacher-roster-where.ts`), so `totals.centerPaid` is `===` `getMonthly`'s `totals.centerStillFronted` — two copies of that clause is the one way the card and its own drill-down could disagree. Per student it returns `centerPaid` (what the center paid the TEACHER for this month's fronted lessons) and **`studentDebt` = the student's debt TODAY, the same figure their profile shows**. The month scopes WHO is listed and what the center paid; it does NOT scope the debt. Two attempts to slice the debt by month were both wrong on production July 2026: reporting the month's lesson cost ignores every payment since (#10026 read 345 000 while owing 156 000), and capping at `min(debt, lesson cost)` failed more quietly — #10058 then read 466 662 against a profile saying 624 989, leaving an admin mid-call with two numbers and no rule for choosing. A balance settles oldest-first across every month, so it has no per-month share to report. Students with nothing left to collect are never listed. **The flag is coarser than the money.** A later payment does clear `isCenterTopUp`: its retroactive billing (`settleDeferredAccruals`) writes the deferred accrual through the same natural-key upsert, which flips the flag (see "Phase 0" below). But the flip needs the lesson covered to the last so'm, and retroactive billing runs only on a payment or `POST /billing/retroactive/:studentId` — a balance raised any other way leaves the flag set. So Z can read higher than what is still outstanding. The drill-down therefore works from `centerUnrecovered` — per lesson, what is still owed on it, then capped at the student's whole debt — lists only students with `centerUnrecovered > 0`, and counts the rest in `totals.repaidStudentCount`, so its `centerPaid` total still equals the card's Z.

**A deactivated employee leaves the payroll list only when their money does.** Both tables on `/payments/salary` drop an `isActive: false` person from the month — but the predicate is the MONTH, not the status: a row survives while it still carries `hasLessonData`, an advance, a `netToPay` or a `SalaryPayment`. A blunt `isActive: true` filter is the tempting simplification and it is wrong — it removes money from the screen AND from the JAMI footer, so a debt exists with nowhere left to see it. Production carried exactly two such people when this shipped: a teacher terminated 27.07 whose May and July payrolls were still `CALCULATED`, and a staff member whose rate closed 17.08 with August's proration unpaid. The teacher table filters explicitly (`salary-monthly.service.ts`, after Step 5+6); the staff table needs no new filter — its existing `monthly === 0 && !payment` drop already does it, and the person falls off by themselves once their last month closes. The filter is SKIPPED when `userId` is set, so `getMonthlyForUser` (profile tab, lehrer portal) never answers "not found" for a person who was asked for by name. Survivors render a «Nofaol» badge so "why is this person still here?" is answered on the row.

**`SalaryMonthlyService.getMonthlyForUser(userId, …)` is the ONE source of a single teacher's salary figures.** It runs the same `getMonthly` pass and returns `{ month, floorMonth, period, row }` — the teacher row, else the non-teaching FIXED_MONTHLY staff row, else `null`. The teacher profile "Ish haqi" tab, both profile cards, the own-profile card and the lehrer portal all render that row. **Never add a screen that computes a teacher's salary itself** — that is exactly how one teacher came to show four different numbers (a forecast, a period-less accrual sum, a raw `User.balance`, and the real report). Scoping lives in `resolveMonthlyScope`'s `userId`: a caller requesting their OWN row (`userId === performedById`) skips BD branch confinement, so an id-exact self lookup can't come back empty on a `UserBranch`/`mainBranch` mismatch; everyone else keeps the normal branch gate. Parity guard: `scripts/verify-per-user-salary-parity.ts` (read-only, compares every teacher's table row to their single-row response field by field).

- **`SalaryStaffConfigService.listStaff` is the write side of the staff payroll.** `SalaryStaffMonthlyService` has surfaced non-teaching FIXED_MONTHLY staff on the monthly report since 2026-07, but it starts from the CONFIGS — and no screen could create one. `/salary/overview` (the only rate list) filters `roles.some.name = 'Teacher'`, and `/payments/salary/config` redirects into it, so the report's empty state told the CEO to go to a screen where no staff member was listed. Production ran with **13 employees and zero salary configs between them**, which is why the section always rendered empty. This service returns each non-teaching employee and their active rate, and nothing else — deliberately NOT a widened `getOverview`, whose per-teacher `actualEarned` / groups / active-students legs are all structurally 0 for a fixed-monthly administrator and would print "earned nothing" beside a salary owed in full. **Student accounts are Users too** (873 of this company's 886 non-teacher users), so the role filter excludes `['Teacher', 'Student']` — excluding Teacher alone buries the 13 real employees. `status` is NOT filtered (a TERMINATED employee's final prorated month is still payable, exactly as the report pays it); `deletedAt` is the hard exclusion and `isActive` rides along so the UI marks them rather than hides them. Rate-less staff sort FIRST — they are the only actionable rows. Branch scoping is the same ceiling-then-narrow rule as `/salary/overview` (`resolvePayrollBranchScope` + `narrowPayrollScope`, fail-closed). Gated **CEO/BD**, narrower than `/salary/overview`, because this list carries the administrative staff's own pay — see the "Salary config" row of `docs/role-access.md`. Writing a rate is `POST /salary/config` — the CEO for anyone, a Branch Director only for an own-branch employee who holds the Teacher role and does not also hold CEO or Branch Director (ADR-0034); staff rates therefore stay CEO-only, because every staff member's roles exclude Teacher entirely.
- **`SalarySummaryService.getTeacherSalarySummary` carries NO monthly money.** It returns group CONTEXT (groupId, name, active students, salary type/value, course price) plus `actualEarned` / `paidTotal` / advances for callers that still want lifetime figures. Its `expectedMonthly` and `expectedPerLesson` forecast fields were **deleted** — they were computed from a hardcoded `exactDays.length * 4` lessons-per-month and contradicted the real report. Do not re-add them.
- **`SalaryOverviewService.getOverview`** reproduces `SalarySummaryService.getTeacherSalarySummary`'s actual-earned math in **bulk** (one query per metric across the page of teachers). No longer the main `/payments/salary` view; now feeds the ⚙ Sozlamalar rate list (teachers + their active configs). `actualEarned` = unpaid (`salaryPaymentId: null`), non-reversed accruals sum.
- **Roles**: the controller default is CEO/BD/Admin/Teacher, and that is all the `me/*` routes (the caller's own data) carry. Every other route narrows it, as listed under Endpoints: reads are CEO/BD (`GET /salary/monthly` included — an Administrator sees no salary, 2026-09-30), except `timeline/:userId` (CEO/BD/Admin — the teacher profile «Taymlayn» tab), `monthly/center-topup` (CEO/BD/Admin/Cashier — the debt page tab, the one salary route a Cashier reaches) and the `period-preview` / `payments/settle-month/preview` previews (CEO); `POST /salary/config` and `config/preview` (BD: own-branch teacher only, ADR-0034), `payments/:id/pay` and `batch-pay` are CEO/BD; every other write is CEO-only. The decorators in `salary.controller.ts` are the list of record.
- **Payroll branch scope** (`salary/shared/payroll-branch-scope.ts`; ADR-0002, ADR-0058): `resolvePayrollBranchScope` gives a CEO `all` and anyone else the SET `mainBranch` ∪ `UserBranch` — `{ kind: 'branches', branchIds, mainBranch }`, sorted, the same set `BranchScopeGuard` confines them to — or `none` when that set is empty (sees and pays nothing). `narrowPayrollScope`: a picked branch inside the set is served, one outside is `blocked`, no pick → `mainBranch` (the lowest attached branch when it is null). Seeing is wider than paying: `payPayment` and `batchPay` stay on the payer's `mainBranch`, and both refuse when it is null. `getMatrix` does not read this scope: it keeps its own hand-rolled `mainBranch` filter, unchanged by ADR-0058, and that filter does NOT fail closed — a Branch Director with no `mainBranch`, or one who also holds the Administrator role, sees every branch there (tracked as a separate security task). A plain Administrator no longer reaches it: `GET /salary/matrix` is CEO/BD since 2026-09-30.
- **Salary types**:
  - `PERCENTAGE` — teacher earns % of per-lesson cost (e.g., 30% of 20,000 = 6,000 per student per lesson)
  - `FIXED_PER_STUDENT` — fixed amount per student per cycle (per month for a MONTHLY course), paid out lesson by lesson — see "`FIXED_PER_STUDENT` semantics" below
  - `FIXED_MONTHLY` — flat monthly salary (no accruals, no group dependency) — used for Admin, Cashier, BD
- **Config lookup**: group-specific config takes priority over global (`groupId DESC` — non-null first)
- **FIXED_MONTHLY** cannot be group-scoped (validated on create/update)
- **Accrual coverage rule (B.1)**: `createAccrual()` only writes if `deductionTransactionId` is provided — teachers don't earn for lessons where the student didn't have a paid cycle
- **Period-closed guard → carry-over**: if a lesson date falls inside a period for which the teacher already has a `CALCULATED`/`APPROVED`/`PAID` SalaryPayment (closed — `CALCULATED` counts, because the cron settles a period the moment the next one starts), `createAccrual()` no longer refuses. It resolves the current open period and sets `SalaryAccrual.creditPeriodDate` to that period's start so the accrual is paid in the next cycle (labelled "Oldingi oydan" in the UI). `lessonDate` is preserved (still drives the rate version + breakdown display). `creditPeriodDate` is **write-once** (set only in the upsert `create` branch) so re-running retroactive billing can't drift the target. Fallback: if the current period is itself `APPROVED`/`PAID` (should never happen), it logs an error and returns null. Centre-funded (top-up) accruals skip this check — the cron writes them into the open period it is settling. See "Salary carry-over" below.
- **Monthly calculation** (`calculateMonthlySalaries()`):
  - Settles the period that just **COMPLETED**, via `resolveCompletedPeriod()` — NOT the in-progress period `now` is inside. The cron fires on `cycleStartDay`, when the "current" period is the one just starting; settling that would pay an almost-empty window and strand the month that just ended. So on cycleStartDay=8 it pays `[8th previous month → 7th current]` (the closed cycle). Triggering manually any day settles the last completed cycle — you can never accidentally pay an unfinished period. (The teacher's live "joriy davr" breakdown still uses `resolveCurrentPeriod` — that view wants the in-progress period.)
  - **Phase 0 — center top-up (full-deserved payroll, `TOPUP_EFFECTIVE_MONTH='2026-07'`+):** before the accrual sweep, for a top-up period (`isTopUpPeriod`, `salary/shared/topup.ts`) it runs an in-memory **gap sweep** (`computeGapAccruals`, same deserved-math as the monthly report / forecast) and writes a **center-funded `SalaryAccrual`** (`isCenterTopUp=true`, `createAccrual({ centerFunded: true })`) for every uncovered billable lesson (a debtor's PRESENT/LATE/ABSENT slot with no live accrual and a resolvable non-FIXED_MONTHLY rate; EXCUSED and config-gap lessons excluded — no rate fabricated). These are ordinary **unlinked** accruals, so the sweep below picks them up like covered ones → the payment's gross becomes the FULL deserved salary. Runs in per-teacher, chunked Serializable txs; skips teachers whose payment for the period is already APPROVED/PAID (no dangling accruals in a closed window). **Double-pay is impossible:** the accrual's natural key `(userId, studentId, groupId, lessonDate, attendanceId)` means when the student later pays, `settleDeferredAccruals → createAccrual` upserts the SAME row (flipping `isCenterTopUp→false`, "recovered") instead of creating a second one; `applyAccrualToBalance` is idempotent per `(attendanceId, teacherId)`. A never-paid (write-off) lesson keeps `isCenterTopUp=true` — the center's permanent cost. Reverting: bump `TOPUP_EFFECTIVE_MONTH` / return `false` from `isTopUpPeriod` (already-written top-up accruals need reversal if paid). The breakdown drawer shows a "Markaz qo'shimchasi" badge + `centerTopUpTotal`. Dry-run: `scripts/preview-topup-run.ts`.
  - **Pricing a gap lesson (`resolveLessonPricing`, ADR-0051):** a LESSON_PACK course → `price / lessonPaymentCount`; a MONTHLY course → the month's frozen `EnrollmentMonthlyCharge` (`perLessonCost`, divisor `plannedLessons`), and when there is none, the lesson's own live `LESSON_CONSUMPTION` pack marker (`metadata.perLessonCost`, divisor `lessonPaymentCount`) — the lesson is priced by what billed it, the same rule as `resolveHeldLessonPrice` on the revenue side. Only when neither exists is it counted in `noChargeUnits` and left unpriced. Callers load the markers with `loadPackLessonPrices(prisma, companyId, packPriceCandidates(...))`, which queries only monthly-course lessons with no charge. Without the fallback, the 97 students who left their group before the 26.09.2026 monthly switch had 173 top-up-eligible September lessons (≈3.0 mln so'm) that no teacher was paid for, while revenue counted them.
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

  **Closing a month from a per-payment plan** (`SalarySettleAllocatedService`, no endpoint; spec `docs/superpowers/specs/2026-09-27-otgan-oylar-oyligini-yopish-design.md`). The button spreads per-account totals over the payments; when the split is decided per PERSON, or a month was paid out before the branch's cash journal existed, the caller names each payment's own `cashSlices` or `predatesCashJournal: true`. The plan must name exactly the month's unpaid rows (it replaces `confirmAmount` as the optimistic lock), slices must be non-negative integers summing to the payment and belong to the payee's branch, and a month the report floors (`scope.month !== input.month`) is refused. `dryRun` returns the per-account totals and writes nothing. Candidate loading, the `paidAt` rules, the transition check and the writer live in `salary-settle-core.ts`, shared with the button so the two can never drift.
  - `recordSalaryPayment({ predatesCashJournal: true })` writes the ledger row and the balance change but **no `CashMovement`**: branch cash accounts opened at 0 with no opening balance (`scripts/backfill-cash-accounts.ts`; Farg'ona 15.06.2026), so money paid before that never passed through a drawer the system knows, and booking it would drive the account below anything ever recorded into it. Combining it with `cashSlices` throws.
  - `scripts/settle-past-salary-months.ts --months=… --as=<CEO id> [--apply]` closed May–August 2026 by the CEO's 27.09.2026 rules (exact split forgotten): paid on the 10th of the next month; a teacher's payout half cash, half card (odd so'm to cash); staff all cash; a month paid before the branch's first `CashMovement` → `predatesCashJournal`. The rules are pure (`scripts/lib/past-salary-month-plan.ts`, tested). Without `--apply` it connects with `default_transaction_read_only=on` and checks that it took effect; with it, every month is re-read (no unpaid row left, one ledger row per payment, movements per account equal the plan) before the next starts.

  **P&L: staff pay is decided by the payee** (`isStaffPayout` in `reports-profit-loss.service.ts`) — no accruals, a global `FIXED_MONTHLY` rate and no `Teacher` role, the staff definition of `SalaryStaffMonthlyService`. The accrual count alone used to decide it; May 2026 has no accruals (entered from the CEO's spreadsheet), so once paid it read as staff pay, and June's net profit — which falls back to the paid staff figure (`paidAdmin`) while no staff rate existed yet — would have lost the whole May payroll.

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
- **Branch rows are written from the start.** `ReportsExpectationHistoryService` reads them back for a branch-scoped caller: a branch list reads each branch's own rows and sums them per day, over exactly the branches that existed (per their own `createdAt`/`deletedAt`) on that day — a day is kept only once every branch expected that day has its row, so a branch created or deleted mid-month never blanks out days outside its own lifetime. Writing the dimension from day one is still what matters: adding it later would have left the past permanently blank, and the past is exactly what cannot be rebuilt.
- **It is NOT an upsert.** The compound unique carries a nullable `branchId`, and in Postgres `NULL = NULL` is never true, so an upsert on the company-wide row would never match, always attempt an insert, and be rejected by the partial unique index on every run after the first. `findFirst` (which translates the null to `IS NULL`) then update-or-create is the correct shape. Two indexes back it: `@@unique([companyId, branchId, date])` and the partial `daily_snapshot_company_row_unique ... WHERE "branchId" IS NULL`, because the first does not stop duplicate company-wide rows.
- **Components are stored, the percentage is not.** `lessonsHeldValue` and `collectedForMonth` are written; the collection % is derived on read. A stored copy can drift from its own components.
- **`totalDebt` / `debtorCount` hold «O'qiyotganlar qarzi» (ADR-0059)** — the `studying` total and count of `ReportsService.getDebtSplit` for the row's scope (company-wide `null`, or the one branch). «O'qimayotganlar qarzi» is not stored, and the two are never added. Rows written before ADR-0059 hold the old status-ACTIVE figure and are NOT rewritten (this record cannot be rebuilt), so the first 21:00 report after the deploy compares across two definitions, for one evening: its ▼ is the definition moving, not debt falling. The exception is a 23:40 snapshot written between the deploy and that report — e.g. a deploy between that day's 21:00 report and the 23:40 snapshot: the first stored row is then already on the new definition, and no such ▼ appears. Studying is a subset of the old set, so the shift only lowers the difference — it cannot raise a false 🟡, but a real rise is hidden by that much for that evening. Nothing but that delta reads these two columns, and no code works around it.
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
- Surfaces, for months before 2026-09: the `/payments/overview` card (and its daily-history dialog), the home page card, Excel «Xulosa» block 4, the Telegram 21:00 line and the `rm:cfin` card; «Foyda tarkibi»'s forecast in every month. They read `ReportsService.getFinancialOverview`'s `forecast.expectedMonthEnd` (with `expectedHeld` / `expectedRemaining`) or call `getMonthlyExpectation` directly. Only that facade fills them: `ReportsFinancialService.getFinancialOverview` knows no expectation, so a caller reaching the raw service gets no such fields. Its old `income.expected` was a hard-coded 0 that the `rm:cfin` card printed until it switched to `getMonthlyExpectation`; nothing read it any more, so the field is gone.
- **From 2026-09 (monthly billing) those surfaces show `MonthCharges` instead (ADR-0058).** Under monthly billing the month is charged up front, so its honest figure is the charge, not a lesson-value projection: `/payments/overview` «{Oy} to'lovlari» (Hisoblandi / To'landi / Qoldi), the home page «Bu oy hisoblandi», Telegram `Bu oy hisoblandi` / `To'landi` / `Qoldi` (21:00 and `rm:cfin`), Excel block 4 «{OY YIL} OYLIK HISOBLARI». The one source is `reports/month-charges.ts` (`loadMonthCharges` → pure `splitMonthCharges`), read through `ReportsService.getMonthCharges`; `getFinancialOverview` returns it as `monthCharges`, `null` for a month before `MONTHLY_BILLING_START_MONTH` (2026-09). charged = Σ CHARGED `chargedAmount` of the month in scope (branch by the charge row); unpaid per student = `min(max(0, debt − later months' charges), this month's charges)` (money settles the oldest charge first, so today's debt sits on the newest charges); paid = charged − unpaid (derived from the balance, not from cash: a bill closed without money — a debt write-off, a manual credit — counts as paid too, and a debit from outside the month, such as a mock-exam fee, is written against this month first); `paidPct` = paid ÷ charged, `null` when nothing was charged. Branch scoping is a chain again: only the holders query carries `branchId`; later charges and balances are read for the ids it returned. Never compute these anywhere else, and never fold older debt into «Qoldi». The projection itself is still computed and snapshotted daily.

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
- **Balance withdrawals are a leg of their own** (ADR-0055): `netProfit = revenue + balanceWithdrawals − teacherSalary − adminSalary − operatingExpenses − refunds`. Every surface that itemises the figure shows the line only when it is non-zero: «Foyda tarkibi», the dashboard «Pul qayerga ketdi», Excel «Xulosa» block 1 and the Tekshiruv footing; «Filiallar» names the branches in its footer (its approved columns do not change).
- **`refunds` counts only refunds still in force (ADR-0058).** Cancelling a refund or a write-off writes a counter-row of the SAME type (`reversedTransactionId` set, `reversedAt: null`) and stamps `reversedAt` on the original, so `getPeriodOutflows` reads REFUND and DEBT_WRITE_OFF with `reversedAt: null` AND `reversedTransactionId: null`, and never through `Math.abs` (which turned a cancellation's counter-row into a refund): `refunds = 0 − Σ` (a live REFUND row is negative), while the write-off memo is the plain Σ (a live DEBT_WRITE_OFF is a positive credit). A cancelled pair counts in neither month. `NET_PROFIT_CACHE_VERSION` is `v5` for this change. `getReconciliation`'s signed per-type sums keep every row on purpose — they must foot to `Student.balance`.

#### «Foyda tarkibi» — the Foyda card's breakdown (ADR-0038)

`GET /reports/profit-composition` (CEO/BD, month = the period's START month, like the card) answers "what is this figure made of, and what will the month close at". `ReportsProfitCompositionService` builds it from `ReportsService.assembleMonthlyNetProfit` — the same call `getMonthlyNetProfit` returns `.netProfit` from — so the lines always add up to the card. Its extra queries only EXPLAIN (expense items, remaining charged lessons, departed debtors); none of them moves the figure.

- **A held lesson is priced by what billed it** (`resolveHeldLessonPrice`, `common/finance/monthly-per-lesson.ts`): a monthly charge that covered that date wins over a `LESSON_CONSUMPTION` marker. The September 2026 switch to monthly billing left the 12-pack markers in place while re-billing the month; reading the marker first overstated September by 2.1 mln. `getRecognizedRevenue` (via `valueHeldLessons`) and the month-end expectation share the helper — never price a held lesson anywhere else.
- **Staff are counted in ONE branch for any profit figure** (`staffBranchBasis: 'home'`: `mainBranch`, else the lowest attached branch). The payroll page keeps membership (an administrator attached to two branches appears in both). Without it, Σ(branches) fell 3 mln short of the company.
- **The forecast is for a running month only:** remaining revenue = `getMonthlyExpectation().expectedValue` − the revenue recognised so far (the expectation already knows cancellations, reschedules and holidays; reading the remainder off its TOTAL keeps a lesson marked after the day's cache from counting twice), the teacher share at the month's ratio so far, and last month's RENT / UTILITIES / tax that this month has not recorded yet. Tax is also recognised under `OTHER` by a "soliq" description, because that is where the centre records it.
- A student who left a group and rejoined it within the month has two CHARGED charges under one key; `loadFrozenMonthlyCharges` keeps the last one's price and the others' dates in `earlierCharges`, and `monthlyChargeBilledDate` checks them all.
- **"Qarz bilan ketgan o'quvchilar"** counts students with NO active enrollment anywhere and a negative balance, capped per student at their current debt.
- Both day caches carry a version (`NET_PROFIT_CACHE_VERSION`, `EXPECTATION_CACHE_VERSION`). Bump it whenever the figure's definition changes, or the cached surface shows the old formula until midnight.
- **«Balansdan yechib olingan»** (ADR-0055) is its own line, by student, only in a month that has one. The forecast's teacher share leaves out the part of it credited to a teacher — a withdrawal is not a lesson.

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
- **Four places write `Transaction` rows outside `TransactionsWriteService`** and each resolves the branch itself: `salary-accrual.service.ts`, `mock-exam-billing.service.ts`, `withdrawals.service.ts`, and `salary/shared/rate-reapply.ts` (re-posts a SALARY_ACCRUAL credit with the original credit's branch, ADR-0050). If you add a fifth, stamp the branch there too.

#### Branch invariants (one student / one teacher / fixed group branch)

Business rules from `docs/branch-decisions.md`. They exist because a second branch turns every "it only works because there is one branch" shortcut into wrong money.

- **D5 — a student belongs to exactly one branch.** `StudentsWriteService.assertSingleValidBranch` rejects an empty `branchIds`, more than one branch, a branch that does not exist or belongs to another company, and a branch the caller does not hold (`assertCallerInBranch`; a CEO holds every branch). It runs on both `create` and `update`, so a student can be neither created in nor moved into a branch the caller cannot act on — checking `create` alone would let a director create a student in their own branch and then move it. A branch-less student is absent from every branch-filtered list and their first payment cannot be booked at all (the ledger is fail-closed).
- **Enrolment enforces the same rule.** `StudentEnrollmentService.enrollToGroup` compares the group's branch with the student's: a mismatch is a `400`, and a student with no branch yet **adopts the group's** (the enrolment IS the branch assignment). Without this the student was listed under one branch while their lesson fees and their teacher's pay were booked to another.
- **D6 — a teacher belongs to exactly one branch.** `GroupsWriteService.update` rejects assigning a teacher whose `UserBranch` points at a different branch than the group. A teacher with no branch attached is allowed through (onboarding handles that case) so an unrelated edit is never blocked.
- **A group's branch is fixed at creation.** `UpdateGroupDto.branchId` is deprecated and **discarded** by the service. The client used to send the header switcher's branch on every save, silently moving the group — plus its students, future lesson deductions and salary accruals — into whichever branch the admin was viewing. Moving a group needs a dedicated operation, not a side effect of renaming it.
- **A group's course and room belong to the group's branch.** `GroupsWriteService.assertCourseInGroupBranch` / `assertRoomInGroupBranch` run on create and on a CHANGED `courseId`/`roomId` on update — for every caller, a CEO included, because it is a rule about the group. The course's branch sets the price the group's students pay (`per-lesson-price.ts`) and can archive the course, which cancels the group, so a foreign course hands another branch control of this one. Another branch's record is a `400`; another company's (or a deleted room) is a `404`; a course with `branchId = null` is refused (fail closed — `POST /courses` always sets a branch, so a branchless course is stray data). An unchanged course/room is not re-checked: the edit form sends both back on every save, and deleting a room does not detach its groups.
- **Lead conversion requires a branch.** `LeadsService.convert` throws when neither `branchId` nor a group resolves one.
- **A teacher may not be put in front of a class without a salary rate.** `GroupsWriteService.assertTeachersHaveRate` blocks create/update when an assigned teacher has no active `EmployeeSalaryConfig`. `createAccrual` silently returns null when no rate version covers the lesson date, and a rate cannot be back-dated into a closed payroll period — so those lessons earn the teacher nothing, permanently (this is how ~20 mln so'm went missing in May 2026). The assignment is the last point where it is still fixable.

#### Staff-only list endpoints

`GET /students`, `/branches` (+`:id`), `/rooms` (+`:id`), `/courses` (+`:id`) and `/dashboard/today-schedule` carried **no `@Roles()` at all**. The global `JwtAuthGuard` only proves the caller is logged in — and a student-portal token is a valid login. `studentSelect` returns phone, parent phone, address, passport series and balance, so any student could pull the centre's entire PII database.

- They now carry `@Roles(...STAFF_ROLES)` (`common/decorators/staff-roles.ts`) — every role **except Student**. A narrow whitelist would be wrong: the dashboard is visible to teachers, the payment dialog to cashiers, group screens to all staff. Students read their own data through `student-portal.controller.ts`.
- The controller specs assert the guard **exists** and excludes `Student`. Four of them previously asserted the opposite ("should NOT have @Roles metadata"), which encoded the hole — do not reintroduce that shape.

#### Student-portal routes refuse a token without `studentId`

`@Roles('Student')` proves the role, not that a student card stands behind the account, so a Student-role token is not guaranteed to carry `studentId`. Prisma reads `{ studentId: undefined }` as "no filter": a per-student query then runs over every student.

- Any handler that reads `@CurrentUser('studentId')` must refuse a missing id with `404 'Talaba topilmadi'` **before** any query.
- New student-portal controllers: put `StudentCardGuard` (`common/guards/student-card.guard.ts`) at class level, **after** `RolesGuard` — `@UseGuards(RolesGuard, StudentCardGuard)` — so staff still get 403 and routes added later are covered without anyone remembering. `DafPortalController` does this; `daf-portal.student-card.e2e.spec.ts` sends every route a token without `studentId` and asserts 404 with zero Prisma calls.
- `StudentPortalController` and `StudentActivityController` still use per-handler `if (!studentId)` checks. `PATCH /student-portal/password` has none on purpose: the password write is keyed on `userId`, and a missing `studentId` only skips the Student history row.

#### One resolved branch scope per report request

Money reports carried **two** branch parameters — `branchId` (the header switcher's pick) and `branchIds` (the caller's own scope) — and every query decided for itself which to honour. `branchWhere()` made it worse by letting `branchIds` OVERRIDE `branchId`, silently discarding the branch the user actually selected. The result: a Branch Director's workbook printed "Namangan filali" on the cover, Fargona's 162 127 987 so'm on the summary sheet and 0 on the P&L; on the web page the empty Namangan branch reported 27 748 684 so'm of debt across 177 debtors, because `receivables`, `debtors` and `activeStudents` ignored the branch entirely.

- **`common/finance/report-branch-scope.ts` is the only branch logic a report may use.** `resolveCallerReportBranchIds(prisma, userId, requestedBranchId)` is called ONCE at the HTTP boundary; the resolved `ReportBranchIds` is passed down to every leg. `branchWhere()` is deleted, and no report type accepts a bare `branchId` any more — the bug class is unrepresentable.
- **The caller's scope is a CEILING; the requested branch NARROWS within it.** Not the reverse. A branch outside the ceiling resolves to an EMPTY list, never a fallback to the whole scope.
- **`null` = every branch (a CEO who picked nothing). `[]` = NOTHING.** Same fail-closed rule as `payroll-branch-scope.ts`. Controllers **refuse** an empty scope with `403` rather than serving zeros: `getSalaryMonthly` / `getMonthlyNetProfit` re-derive their own scope from `performedById`, so a zero-filled report would still contain that caller's payroll and read as a catastrophic loss.
- **Three predicate shapes, because the branch lives in three places**: `branchIdWhere` (Payment, Expense, Transaction, CashMovement), `studentBranchWhere` (Student — via the `StudentBranch` join, the same predicate every student list uses), `userBranchWhere` (SalaryPayment / SalaryAccrual carry NO branch — it comes from the employee's `mainBranch`/`UserBranch`).
- **Count legs need scoping too.** `getFinancialTrend` / `getYearlyTrend` scoped money by branch but took new-student and unique-payer COUNTS company-wide, so a branch series plotted 0 so'm beside "715 new students". `getReconciliation` took no branch at all, so every workbook's Tekshiruv sheet footed against the whole company.
- **`reports-branch-scope-coverage.spec.ts` is the regression guard**: with a scope set, EVERY query a money report issues must carry a branch predicate. A newly-added unscoped query fails it immediately. `scripts/audit-branch-scope-sum.ts` checks the same invariant (`Σ(branches) == total`) against real data.

#### A detail read outside the selected branch names its branch

`GET /groups/:id` and `GET /students/:id` filter by `@BranchScope()` (the switcher). A record in another branch the caller may open (`@BranchCeiling()`) answers 404 `{ message, branch }`, built by `inOtherBranch` with `ceilingIsWider` (`common/auth/other-branch.ts`), so the page offers to switch instead of saying «topilmadi». Outside the ceiling it stays a plain 404, so the id still leaks nothing. On 01.10.2026 the bare «guruh mavjud emas» led a CEO to cancel eight Namangan lessons (ADR-0063). A new id-addressed detail read that filters by the header does the same.

#### Object-level branch confinement

A `@Roles()` guard proves the caller has a role, not that the record is theirs. Two id-addressed writes were company-scoped only:

- **`BranchesService.update` / `changeStatus`** — a Branch Director could pass another branch's id and edit or **CLOSE** it. Closing cascades: every group of that branch goes `CANCELLED` and every active enrollment `DROPPED`. `assertCallerMayTouchBranch` now confines non-CEO callers to their own branch and **fails closed** when the caller cannot be identified.
- **`UsersService.updateUser`** — accepts `password`, so a director could take over another branch's accounts. `assertCallerMayTouchUser` requires an overlap between the caller's branches and the target's; editing yourself is always allowed, a CEO spans everything, and a branch-less caller or target is refused.
- **Overlap alone was not enough for WRITES (ADR-0027).** It let an Administrator set the password, phone or status of the Branch Director in their own branch, and of the four production CEO accounts that have a branch attached. The phone matters as much as the password: Telegram sign-in finds the account by phone and asks for no password. Every route that writes to an existing account (`PATCH`/`DELETE /users/:id`, `PATCH /teachers/:id`, `PATCH /teachers/:id/status`, `DELETE /teachers/:id`) now calls `assertCallerMayManageUser` in `common/auth/user-branch-scope.ts` (or the `…Record` variant when the target is already loaded): overlap, plus every role the target holds must be inside `grantableRoleIdsFor(caller roles)`, with the caller read from the DB (`deletedAt: null`). It covers the WHOLE account, not a list of sensitive fields. Yourself: no branch or rank check, but nobody below CEO changes their own status or archives themselves (`changesStatus`; the form resends `status` on every save, so pass `dto.status !== current`). The teacher routes need it because they match any account holding the Teacher role, a director who teaches included.
- **Reads and comments keep `assertCallerMayTouchUser`** (overlap only): entity history, comments on an employee profile, a teacher's groups, status trail and salary summary. A new route that WRITES to an existing `User` uses `assertCallerMayManageUser`, never the touch variant.

**Use the shared helpers** in `common/auth/branch-scope.ts` rather than re-deriving this per service:

- `resolveCallerBranchScope(prisma, userId)` → `{ kind: 'all' }` for a CEO (deliberately branch-less, spans everything) or `{ kind: 'branches', branchIds }` for everyone else, merging `mainBranch` and `UserBranch` because different parts of the system wrote one or the other. A non-CEO with no branch gets an **empty** list — nothing, never everything.
- **The scope is a SET, deliberately.** An Administrator normally works in one branch, but attaching several is supported: pick multiple branches on the employee form and they act in each exactly like a local admin. Confining to `mainBranch` alone would lock a multi-branch admin out of every branch but one. Payroll reads the same set (`resolvePayrollBranchScope`, ADR-0058). `mainBranch` remains the tiebreak where a single answer is needed: the payroll branch when none is picked, the branch a salary is paid from, and outreach.
- `assertCallerInBranch(prisma, userId, branchId, message?)` — throws `ForbiddenException` unless the caller may act on that branch.
- **A write with no signed-in caller must SAY so.** `UsersService.create` takes a required `UserWriteActor` — `{ kind: 'user', id }` or `{ kind: 'self-registration' }` — never a bare optional `callerUserId`. Only `self-registration` skips the two caller-relative checks (the per-branch caller check and the role ceiling, ADR-0026), and only because `generateEmployeeLinkPayload` already applied the same branch + role ceiling when it HMAC-signed the invitation link. Treating a missing argument as "skip the check" is what broke Telegram staff registration for twelve days across both branches (see ADR-0008): the bot is the one caller-less path in the system, the branch guard refused it, and a bare `catch {}` in the scene turned a total outage into a polite apology with nothing in the logs. Registration scenes now log the failure. When adding a caller-less path, add an actor variant — do not widen the "no caller" case.

Applied to:

- **Attendance** (`attendance.controller.verifyGroupAccess`) — attendance is a money path: saving it deducts from student balances and writes teacher accruals. Only pure teachers were checked, so an Administrator or Branch Director of one branch could take attendance for ANOTHER branch's group, billing its students and paying its teacher. A pure teacher is still checked by group assignment (the stronger test); everyone else by branch.
- **Cash accounts** (`CashAccountsService.findOne(id, companyId, userId?)`) — `findAll` scoped by branch but every id-addressed operation (movements, patch, delete, transfer, reconcile) checked only `companyId`, so a director could transfer money out of the other branch's kassa or post an adjustment to it. Pass `userId` on any path that reads or moves an account's money; `transfer` checks **both** sides.
- **Rooms and courses** (`update`, `changeStatus`, `delete`, `getStatusHistory` in `RoomsService` / `CoursesService`) — looked the record up by `companyId` alone, so a director of one branch could change another branch's course `price` (every per-lesson charge derives from it), switch its `paymentModel`, or archive it, which cancels its groups. Each now calls `assertCallerInBranch` on the record's own branch after its existence check. `Course.branchId` is nullable: a course in no branch is CEO-only (`CoursesService.assertCallerMayTouchCourse`), matching `branchIdWhere`, which already hides it from every branch-confined read.
- **Creates that name their branch in the body** — `POST /groups`, `/cash-accounts`, `/rooms`, `/courses`, `/students`. There is no record to check yet, so each first confirms the branch exists in the company and then calls `assertCallerInBranch` on it. The first question does not answer the second: rooms, courses and students stopped at it until 2026-09-24, which let a director of one branch create them in another.

When adding a new id-addressed mutation, check the record's branch against the caller's — `companyId` alone is not a boundary once there is more than one branch.

#### Branch state

- **A branch's state is `Branch.status`, and it changes only through `PATCH /branches/:id/status`**, which validates the transition, writes `StatusHistory` and runs `StatusCascadeService` (INACTIVE pauses the branch's ACTIVE groups; CLOSED/ARCHIVED cancel them, drop enrollments with refunds and archive rooms). `PATCH /branches/:id` refuses both `status` and `isActive`.
- **`Branch.isActive` is a derived copy with no reader.** `changeStatus` and archive restore keep it equal to `status === 'ACTIVE'`; nothing filters on it. The settings form used to write it on its own ("Faol/Nofaol"), which marked a branch inactive while the bot, going by `status`, kept registering people into it. Read `status`, never `isActive`.

#### Registration deep links

- **Teacher onboarding goes through the SIGNED `employee_<branch>_roles_<ids>_t_<issued>_sig_<hmac>` link only.** The legacy unsigned `teacher_<branchId>` payload is **retired** — it carried no signature, so anyone holding one could edit the number and register as a teacher of any branch. `/start` answers old links with "ask for a new link" rather than failing silently. The client mints links via `POST /telegram/employee-link` (see `useTeacherRegistrationLink`); never build a payload in the browser.
- **A link IS an account, so the issuer's own role caps what it may grant.** `GRANTABLE_ROLE_IDS` (`telegram/constants.ts`): CEO → all, Branch Director → Administrator/Teacher/Cashier, Administrator → Teacher/Cashier. Without this ceiling an Administrator could mint a CEO link for their own branch and grant themselves full access — the existing branch check would not stop them. The link dialog and the employee form hide non-grantable roles (`client/src/lib/role-grant-ceiling.ts`); the service re-checks. The issuer's roles, branches and CEO-ness come from ONE database read (`whereUserMayAct()`); the controller passes only the caller's id, because a token's roles can be an hour stale and a link minted from it keeps that authority for its three days — an archived CEO's token used to mint CEO links (ADR-0028).
- **The employee form answers to the same map (ADR-0026).** `POST /users` and `PATCH /users/:id` used to refuse only the CEO role, so an Administrator could create a Branch Director, or promote themselves (acting on yourself skips the overlap check). Both doors now read `GRANTABLE_ROLE_IDS` through `grantableRoleIdsFor`; do not write a third reading of it. On the form, `UsersService.assertCallerMayChangeRoles` reads the caller's roles from the DATABASE (`whereUserMayAct()`: not archived, not blocked — ADR-0028), compares role SETS (the form sends `roleIds` on every save, so an unchanged set is not a grant), and refuses a change unless every role the target holds now and after is inside the caller's ceiling — nobody below CEO reshapes their own roles or a superior's. For anyone other than the caller, the rank rule (ADR-0027, above) refuses a superior's account before the ceiling is reached, so the reshape rule is what guards your OWN roles. `POST /users` and `PATCH /users/:id` admit CEO and Branch Director only. The link reads its caller the same way.
- **A link can be opened for three days (ADR-0029).** Its issue time (whole seconds, base36) is inside the signed part, so moving it forward breaks the signature instead of reviving an old link. `/start` (`startEmployeeRegistration`) checks the signature, then the age, then the branch: a link older than three days, or one in the undated pre-ADR-0029 format, is answered "Bu havolaning muddati tugagan. Administratordan yangi havola so'rang."; an edited time fails the signature and gets the generic invalid reply; a link dated more than five minutes ahead of this server's clock is refused as invalid until its time comes, so however wrong the minting clock, no link is accepted for more than three days and five minutes in all. The age is checked only when the link is opened: a registration started inside the three days can finish later. `checkEmployeePayload` is the only way to accept a link: it returns `valid | expired | invalid` in one call, so nothing can accept a link on its signature alone — do not add a signature-only check, and compare the verdict to `'valid'` (every verdict is a truthy string). Within its three days a link is still reusable and cannot be revoked on its own (rotating `TELEGRAM_LINK_SECRET` kills every link); ADR-0022's stage 2 replaces these links with personal one-time ones. The payload must stay base64url and at most 64 characters: `employee-deep-link-payload.spec.ts` keeps the worst case (branch 999999, all five roles) inside 64 — it is 61 characters, 62 after 2038.
- **Every payload starting with `employee_` is answered by `startEmployeeRegistration`.** One that parses as neither the dated nor the undated format — a link cut short or edited on the way: an empty issue time, a missing or non-hex signature — gets the generic invalid reply. Falling through showed the plain menu, so the link looked like it did nothing. A new deep-link kind must therefore not start with `employee_`.
- **Every handler that sets `ctx.session.processing` releases it in a `finally`.** Telegraf saves the session even when a handler throws, and the `/start` middleware ignores a chat whose flag is set, re-saving it so the 24-hour TTL restarts on every try: a flag left set by a throw (a database error, a missing `TELEGRAM_LINK_SECRET`, a failed Telegram call) locks that person out of `/start` for as long as they keep trying. The error still propagates to Telegraf's handler and is logged. Each `/start` deep-link kind has its own method (`startEmployeeRegistration`, `startStudentGroupRegistration`, `startMockExamRegistration`, `startStudentRegistration`) that releases the flag before `ctx.scene.enter`, because the scene's own handlers read it; the scene buttons that set it run under `withProcessingLock` (`telegram/utils/processing-lock.ts`), which holds it until they return. A new handler that sets the flag does the same — `SessionData.processing` says why.
- **Branch lookups in `/start` handlers filter `deletedAt: null` + `status: 'ACTIVE'`** so an archived branch, or one that is INACTIVE, CLOSED or ARCHIVED, cannot accept new registrations: the student and student-group links answer "Filial topilmadi. Administrator bilan bog'laning.". The `student_<branch>` link was the exception, a `findUnique` by id alone, until it got the same filter.
- **The branch number in a `student_` link is read by `parseDeepLinkBranchId` (`telegram/constants.ts`): plain digits up to 2147483647, because `Branch.id` is a Postgres int4.** Anything else is answered "Noto'g'ri havola. Administrator bilan bog'laning." with no lookup. `Number()` alone accepted `1.5`, which Prisma truncates to branch 1, read `1e3` and `0x10` as branches 1000 and 16, and let `Infinity` (a Prisma validation error) and numbers past int4 (P2020 from Postgres) reach the lookup, where they threw and left the person without an answer. A new deep-link kind that carries a numeric id reads it the same way.

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
- **No "% of course" rule.** The old 50%-completed gate divided by `lessonPaymentCount`, which is the size of a **billing cycle**, not the course — a student 19 lessons into a 12-lesson cycle read as "158% attended". There is no total-lessons figure in the schema to divide by, so the warning was removed rather than made up. The preview warns about something true instead, as the next bullet says.
- **The preview warns only when the quote is balance-only** — no prepaid lessons (`prepaidLessonsRemaining === 0`) and a positive balance — so the sentence is true of the money the quote is made of. A MONTHLY course then gets `MONTHLY_REFUND_WARNING` (contract 6.2: only the surplus on the balance is refunded, and this month's money is settled by the departure rule when the student leaves the group) instead of the pack sentence «Oldindan to'langan darsi yo'q — faqat balansdagi puldan qaytariladi», which would misdescribe a course that writes no prepaid counter; a pack course gets that older sentence. Any other quote has no warning. In particular, a MONTHLY enrollment that still carries a stale pack counter has `prepaidRefundValue` inside `maxRefundable`, and a sentence saying only the balance is refunded would contradict the ceiling `quickRefund` follows. A student with no ACTIVE enrollment (and no `enrollmentId` named) gets the separate balance-only quote, with its own «Faol guruhi yo'q …» text.
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
- **A SETTLED advance is immutable.** `update` and `remove` both refuse (`409 Conflict`) when `existing.category === TEACHER_ADVANCE && settledBySalaryPaymentId !== null`. `applyPendingAdvances` bound that advance to one `SalaryPayment` and reduced its `amount` by exactly this figure, so editing it afterwards leaves the payment reduced by the OLD number and breaks the payslip's `grossTotal − settledAdvances = payment.amount` identity. The only correct fix is to cancel that salary run first. Both list endpoints (`GET /salary/advance-calendar`, `GET /salary/advances/:userId`) return `settled` + `settledPeriodStart/End` per row so the UI can disable its edit/delete buttons and name the reason — but the guard is the service's, not the button's.
- **An advance stays an advance, and stays with its recipient.** `update` refuses (`400`) a `category` change away from `TEACHER_ADVANCE` and any `relatedUserId` change, including to `null`. Moving the money to another employee silently is exactly what the delete-then-recreate flow exists to avoid (two explicit entries in the history instead of one invisible transfer), and `expense-form-dialog.tsx` sends `relatedUserId: null` on every save — that dialog never opens on an advance today, but if it ever does the request must fail loudly rather than orphan the row. `assertAdvanceRecipient` is shared by `create` and by `update`'s "turning a plain expense INTO an advance" branch, so the requirement cannot drift between the two paths.
- **The Expense date is not the cash-flow date.** `CashMovement` carries no business date, only `createdAt`, and `reports-cash-flow.service.ts` filters on it. Correcting an advance's `date` therefore moves it in the advance calendar, the salary page and the Telegram report, but leaves the kassa movement on the day it was entered. Pre-existing for every expense; the advance dialog states it to the user rather than pretending otherwise.

#### Reports Module (`src/reports/`)

- **Endpoints**: `GET /reports/financial-overview`, `GET /reports/financial-trend`, `GET /reports/monthly-debt-recovery`, `GET /reports/kpis`, and more
- **Roles**: CEO, BD (money reports). `financial-trend` is `@Roles('CEO', 'Branch Director')`.
- **`financial-overview` role split (deliberate — do NOT re-tighten to CEO/BD-only)**: the endpoint is `@Roles('CEO', 'Branch Director', 'Administrator', 'Cashier')`, but CEO/BD get the FULL payload while Administrator + Cashier get a stripped **operational-only** subset — `{ ltvPayerCount, avgPayment }` and nothing else. The controller does this redaction at the HTTP boundary (reads `@CurrentUser()` roles; returns full only when the caller has `'CEO'` or `'Branch Director'`), so a direct API call by an admin/cashier can't leak income/expenses/profit/salary/LTV/CAC/ROI/forecast/debt. This backs the `/payments/overview` UI where ordinary admins see only the "To'lov qilganlar" + "O'rtacha to'lov" cards (the 6 money cards and the Prognoz/Oyliklar/Qarzdorlik/To'lov-usullari blocks are `canSeeFinancials` gated, CEO/BD only). Redaction lives in the controller ONLY — `ReportsFinancialService.getFinancialOverview` still returns every figure it computes (the Telegram `rm:cfin` group card calls the service directly with a CEO scope and must keep them). The full payload also carries `monthCharges` (`MonthCharges | null`, ADR-0058: «hisoblandi / to'landi / qoldi» of the period's START month, `null` before 2026-09 — see "One month-end expectation") and `debtSplit` (`DebtSplit`, ADR-0059: today's debt as two numbers — see "Debt as two numbers" below). The `ReportsService` facade adds both (the raw `ReportsFinancialService` overview has neither, and no `forecast` either: the facade builds `forecast` from the three expectation figures alone), and the Administrator/Cashier whitelist drops both like every other money figure.
- **Financial overview** calculates: income (actual vs forecast), salary (paid + pending; no tax — see "No tax calculation" under Salary Module), expenses, net profit, LTV, CAC, marketing ROI, avg payment. It carries no debt figure of its own — the `ReportsService` facade adds `debtSplit` (next bullet).
- **Debt as two numbers (ADR-0059)** — `reports/debt-split.ts` is the ONE source (`loadDebtSplit` → pure `splitDebt`; `studyingDebtorWhere` is its studying-debtor predicate) and answers `DebtSplit { studying: { total, count, currentMonth, older }, notStudying: { total, count } }`. Readers go through `ReportsService.getDebtSplit(companyId, { branchIds, month? })`, except `getDebtorSummary` in `payments-debtors.service.ts` (behind `GET /payments/debtors/summary` and the home page's attention block), which calls `loadDebtSplit` / `splitDebt` directly. **«O'qiyotganlar qarzi»**: `deletedAt: null`, `balance < 0`, `...activeStudentWhere()` (the ADR-0015 «faol o'quvchi»); per student `currentMonth` («shu oy», 🟡) = `min(debt, Σ his CHARGED chargedAmount of the Tashkent month)`, `older` («eski qarz», 🔴) = the rest. **«O'qimayotganlar qarzi»**: the same base with `NOT: activeStudentWhere()` — ungrouped, frozen, expelled; the two sets are one predicate and its negation, so a debtor is in exactly one. Archived cards (`deletedAt` set) are in neither. Branch scope is `studentBranchWhere` (an empty scope reads zeros); the charges read is deliberately NOT branch-scoped (the balance is one). The two numbers are NEVER added: no surface prints a combined «Jami qarz» or an «O'rtacha qarz» any more, and the client computes none of it (the Excel «Qarzdorlar» sheet keeps its own «Jami qarz» row on purpose — it is on ADR-0059's unchanged list). **Pass no `month`** — only the current Tashkent month means anything (a past month sets that month's charges against TODAY's balance); the `rm:cfin` card passes its own, which is the current one. Readers: the facade's `financial-overview` (`debtSplit`, CEO/BD only; the Moliya «Qarzdorlik» block is today's state whatever period the page asks about), the home money card (`overview.debtSplit` — no second read for the card, ADR-0012; the page's attention block reads the split again through `getDebtorSummary`, for the promise counts), `GET /payments/debtors/summary` (`{ split, openPromises, overduePromises }` behind the `/payments/debt` cards and the outreach banner; the cards describe the whole branch scope, ignore the list's filters and, unlike the list, leave archived cards out), the Telegram 21:00 report, `/qarzdorlar` (both totals plus the five largest STUDYING debtors, read with `studyingDebtorWhere`, ties broken by id), `/stats`, the `rm:cfin` card (these four print the lines of `telegram-groups/utils/debt-split-lines.util.ts`), `DailySnapshotService` and the Excel «Filiallar» column (`studying.total` per branch; its totals row adds branches, which is valid because a student sits in exactly one — D5). A failed read never becomes a zero («nobody owes»): the overview, the 21:00 report and the Excel export fail whole, the `rm:cfin` card drops its debt lines. Known effects, not bugs: before the month's charges are written all studying debt reads as «eski qarz»; a student with status ACTIVE and no active group is «O'qimayotganlar», and so is one with status ARCHIVED but `deletedAt` null. The surfaces that keep their own debt definition on purpose (the «Oylik qarzdorlik» tab tiles, the debtor list, the balance sheet's «Debitorlik» and others — the full list is in ADR-0059) are NOT to be aligned to the split without a new ADR. Never compute the split anywhere else, and never add the two.
- **Debt by the month it arose** (`GET /reports/monthly-debt-recovery/history` + `/:monthKey/aging`, CEO/BD; `ReportsDebtHistoryService`): what the `/payments/debt-history` page shows. TODAY's debt, split by the month each unpaid charge landed in — disjoint buckets, so the column sums EXACTLY to the live total and the page's «Jami» row is real. One chronological ledger replay produces all of it: the aging split, each month's own created debt, the current status breakdown (Faol / Chetlatilgan / Muzlatilgan / Arxiv, which doubles as the page filter) and the longest-standing debtors. Reversals are NOT filtered — `reverseTransaction` writes its counter-row with the original's type, so both halves net to zero; filtering `reversedAt: null` keeps the undo and drops the original. A cancelled write-off keeps both rows in the walk too. Its counter-row's increase goes under «Yangi qarz», as a reversed payment's does; the original differs — a reversed payment's original stays under «To'landi» (`debtPaid`), but a cancelled write-off's original (`reversedAt` set) moves from «Kechirildi» to «Boshqa» (`debtOther`). So a closed month's «Kechirildi» can change after the fact, when a forgiveness it holds is cancelled later; its closing debt cannot (ADR-0058). The month's write-off list (`monthWriteOffs`) reads only write-offs still in force (`reversedAt: null AND reversedTransactionId: null`). It replaced a month-end-BALANCE series that could not answer the question being asked: a frozen debtor showed the same cumulative figure under every month (#10399 read 815 163 under both June and July), and overlapping balances meant the total row had to stay blank — the old «Jami» printed 317 mln against 83.75 mln actually outstanding, counting 551 distinct debtors 1 573 times.
- **Month-end debt + recovery** (`GET /reports/monthly-debt-recovery`, CEO/BD; `ReportsFinancialService.getMonthlyDebtRecovery`) — the COHORT view, still used by the Excel workbook. Its rows must NEVER be summed across months (nested windows). Reversals are filtered only on the write-off side: the cohort write-off sum, `forgivenCount` and the drill-down's write-off list count only write-offs still in force (`reversedAt: null AND reversedTransactionId: null`, ADR-0058), while the drill-down's payment list keeps every row. The drill-down claims a write-off BEFORE a payment when both compete for the same capped debt, so forgiveness is not squeezed out of the column: per Tashkent calendar month (from `systemStartDate`), the total student debt the center CLOSED THAT MONTH WITH plus how much of that cohort has since been recovered. **Reconstructed from the append-only `Transaction` ledger — no snapshot table.** `balanceAsOf(monthEnd)_i = Student.balance_i − Σ(Transaction.amount WHERE studentId=i AND createdAt >= nextMonthStart)` — the full signed sum (all types incl. reversed, which net out) reconciles exactly to the live balance, so each past month-end is derivable AND stable (corrections land at `createdAt = now()`, never rewriting the past). Cohort = balanceAsOf < 0 across **any status** (not just ACTIVE, no `deletedAt` filter). `recovered_i = min(debt_i, Σ PAYMENT after monthEnd)` (oldest-first cap); `DEBT_WRITE_OFF` is a separate "kechirilgan" column. Surfaces as the Excel "Oylik qarzdorlik" sheet (past-safe, never dropped) and the `/payments/debt-history` page. Do NOT copy the old report's `status:'ACTIVE'`/`deletedAt:null` filters into the cohort query, and do NOT filter `reversedAt` in the balance reconstruction (the write-off reads above are the only filtered ones) — both silently corrupt the numbers.
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

This is the `LESSON_PACK` path. A `MONTHLY` course's attendance never touches the balance (`processMonthlyAttendance`): the month was charged up front, so attendance only accrues the teacher and books excused-lesson credit.

1. **Idempotency**: skip if a non-reversed `LESSON_CONSUMPTION` already exists for `attendanceId`.
2. **Lock** `Enrollment` row (`SELECT FOR UPDATE`).
3. If `enrollment.prepaidLessonsRemaining > 0`:
   - Decrement by 1.
   - Coverage tx for accrual = most recent `LESSON_DEDUCTION` on this enrollment.
4. Else (need to refill):
   - Lock student balance.
   - `balance >= fullCycleCost` → `FULL_CYCLE`: deduct full price, set `prepaidLessonsRemaining = lessonPaymentCount`, decrement.
   - `balance >= perLessonCost` → `PARTIAL`: `N = lessonsAffordable(...)` lessons (see "A cycle costs exactly its price"), deduct their cumulative price, set prepaid = N, decrement.
   - `balance < perLessonCost` → `SINGLE_UNCOVERED` (the debtor path): deduct this one lesson's price anyway (`lessonPriceAt` — the cycle's last lesson carries the rounding remainder) and let the balance go **negative**, so the real debt stays in the ledger. The deduction is flagged `salaryDeferred: true` with `uncoveredAmount`: step 6 writes no accrual now (B.1), `settleDeferredAccruals` writes it once a payment covers the lesson (see "Retroactive billing on payment"), and until then the payroll cron's Phase 0 fronts it as a centre top-up (see Salary Module).
   - All three compare against the student's **discounted** cycle price.
5. Write `LESSON_CONSUMPTION` audit row (amount=0, balance unchanged, metadata = `{ perLessonCost }`) — on every path above.
6. Create `SalaryAccrual` for each teacher resolved for this lesson (`LessonTeacherOverride`-aware) linked to the coverage tx — skipped for `SINGLE_UNCOVERED`, which has none yet.

##### Reverse algorithm (PRESENT/LATE/ABSENT → EXCUSED)

The only reversing transition in the matrix above. `ABSENT` is billable, so a flip between PRESENT, LATE and ABSENT reverses nothing.

1. Reverse the lesson's `SalaryAccrual` for each teacher resolved for that lesson (override-aware; sets `reversedAt`/`reversedById`/`reversalReason`). This runs even when step 2 finds nothing.
2. Find the active `LESSON_CONSUMPTION` for this attendance. If found, `reverseTransaction(consumption.id, ...)` (which sets `reversedAt` on the original — see "Reversal markers" below), then:
   - lesson billed by a `SINGLE_UNCOVERED` deduction (the debtor path) → reverse that deduction too (balance restored, debt removed) and step `cycleLessonIndex` back (`GREATEST(x − 1, 0)`); **no** prepaid increment — the student never paid for a unit;
   - otherwise → `prepaidLessonsRemaining +=1`.
3. If consumption was **never** written (legacy rows from before the debtor path billed — Misol 7): only step 1 runs; **prepaid is NOT incremented** (no free lessons).

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

`createAccrual()` only writes when the caller passes the lesson's coverage `deductionTransactionId` (the non-reversed `LESSON_DEDUCTION` that paid for it), or `centerFunded: true` (the payroll cron's Phase 0 top-up, which bypasses this gate). A lesson dated inside a closed payroll period is NOT refused: the accrual is carried over to the current open period via `creditPeriodDate` — see "Salary carry-over (late payment)" below.

The monthly calculation sums only accruals with `reversedAt: null`, so reversed lessons don't pay teachers.

##### Lesson-deduction reversal endpoint

`POST /billing/lesson-deduction/:id/reverse` (CEO/BD) — undoes an entire prepaid batch:

- Reverses the deduction (balance restored).
- Reverses every linked `SalaryAccrual`.
- Reverses every `LESSON_CONSUMPTION` for the same enrollment dated after the batch.
- Resets `enrollment.prepaidLessonsRemaining = 0`.

Use case: admin entered the wrong cycle, wrong group, or wrong amount. Distinct from the per-attendance flip (which handles "this single lesson didn't happen").

##### Retroactive billing on payment

Debtors (`balance < perLessonCost`) can be marked just like any other student — `attendance-save` and `qr-attendance-scan` no longer block them, and the teacher attendance roster shows them inline with a "Qarz" badge. The lesson is billed when it is held, through the `SINGLE_UNCOVERED` path (balance goes negative, consumption written); only the teacher's accrual waits (B.1).

The catch-up runs the moment money lands: `PaymentsWriteService.create()` and `createFromExternal()` both invoke `LessonBillingService.processRetroactiveBillingForStudent(tx, ...)` from inside the same Serializable payment transaction. It has two phases.

**Phase 1** walks every active enrollment, picks billable (PRESENT/LATE/ABSENT) attendance that still has no active `LESSON_CONSUMPTION` — rows from before the debtor path billed, or whose consumption was reversed without a status change; for a `MONTHLY` enrollment only lessons before its first monthly charge, and none until that charge exists — **oldest-first**, and iteratively delegates to `bill()` — the same private method the live attendance flow uses. Each iteration:

- Re-reads the live balance and `prepaidLessonsRemaining`.
- Picks full / partial / `SINGLE_UNCOVERED` just like a fresh attendance write would, so a lesson the money does not reach is still billed, as debt.
- Verifies a `LESSON_CONSUMPTION` was actually written; if not (only the zero-price guard skips it), breaks out of the loop for that enrollment.

**Phase 2** (`settleDeferredAccruals`) pays the teachers. It walks the student's `salaryDeferred` `SINGLE_UNCOVERED` deductions oldest-first with what the payment covered (total uncovered minus the debt still left): a fully covered lesson gets its `SalaryAccrual` written and its flags cleared, a partly covered one only shrinks `uncoveredAmount`. It runs even when the student has no active enrollment left (a frozen or dropped student's payment still has to pay the teacher).

Idempotent — calling it on a student with everything already settled is a no-op (the `LESSON_CONSUMPTION` idempotency guard inside `bill()` short-circuits).

Manual trigger: `POST /billing/retroactive/:studentId` (CEO/BD/Admin) opens its own Serializable tx via `runRetroactiveBilling()`. Used for legacy/migration cleanup or admin-driven recovery; the regular payment pipeline already invokes it automatically.

**Salary period closed → carry-over**: if a retroactively-settled lesson date falls inside a period for which the teacher already has a `CALCULATED`/`APPROVED`/`PAID` `SalaryPayment`, `createAccrual` no longer skips. It carries the accrual into the current open period via `creditPeriodDate` (see "Salary carry-over (late payment)" below) so the teacher is paid automatically in the next cycle. Only if the current period is itself `APPROVED`/`PAID` does it log an error and skip (then admin handles via balance-withdrawal).

#### Salary carry-over (late payment) — `SalaryAccrual.creditPeriodDate`

When a student pays late and retroactive billing settles a lesson whose own payroll period is already closed (the teacher has a `CALCULATED`, `APPROVED` or `PAID` `SalaryPayment` for it), the teacher's accrual would otherwise be lost. Instead it is **carried over** to the current open period.

- **Schema**: `SalaryAccrual.creditPeriodDate DateTime?` (full timestamp, NOT `@db.Date` — avoids Tashkent-offset truncation breaking range comparisons). NULL = bucket by `lessonDate` (default, unchanged). Non-null = bucket into the period containing this date instead.
- **Bucketing**: every payroll query that slices accruals by period uses an effective-date OR — `OR: [{ creditPeriodDate: { gte, lte } }, { creditPeriodDate: null, lessonDate: { gte, lte } }]`. Applied in `salary-calculation.service.ts` (the monthly sweep) and `salary-breakdown.service.ts` (`getCurrentCycleBreakdown`). Summary/reports queries have no period filter so they pick up carry-overs automatically.
- **Rate is unaffected**: `findActiveVersion` still keys off the original `lessonDate`, so a past lesson keeps its past rate.
- **Notification**: `createAccrual` pushes a `CarriedOverAccrual` into an optional `carriedOverSink` (threaded from `LessonBillingService.processRetroactiveBillingForStudent` → `bill()`/`settleDeferredAccruals`). `PaymentsWriteService.create()`/`createFromExternal()` collect the list and emit `salary.carried-over` **after the tx commits**, together with the receipt (`announceCommitted`; an `outerTx` caller calls it after its own commit). `NotificationEventsListener` groups by teacher and fans out one message per teacher across all four channels (the Telegram leg through the 20:00 digest).
- **UI**: breakdown lines expose `isCarriedOver`; totals expose `carriedOverTotal`/`carriedOverCount`. A purple "Oldingi oydan" badge + a "shundan oldingi oydan" subtotal show on both the admin `salary-breakdown-drawer.tsx` and the teacher `teacher-salary-client.tsx`.
- **Limitation**: accruals lost to the _old_ refuse-and-log behaviour (before this shipped) can't be auto-recovered — admin uses Balance Withdrawal `creditTeacher`.

#### Salary Versioning (`EmployeeSalaryConfigVersion`)

Every salary config write (PERCENTAGE / FIXED_PER_STUDENT / FIXED_MONTHLY) creates an SCD2 version row alongside the parent `EmployeeSalaryConfig` mirror. Accruals look up the version active on the lesson date, so a rate applies from its `effectiveFrom` and never before it.

- **A rate write re-prices the lessons already written from its start (ADR-0050).** Accruals are written when attendance is marked, so a rate saved with a past `effectiveFrom` used to reach only lessons marked AFTER the save — #072 opened 24.09.2026, its rate was corrected on the 29th, and 24 lessons stayed at 9 524 instead of 16 429. `reapplyRateToOpenAccruals` (`salary/shared/rate-reapply.ts`) now runs inside the same transaction as `createConfig`, `updateConfig` (rate change, reactivation, deactivation) and each teacher of `applyGlobalConfig`: every accrual from the Tashkent day of `effectiveFrom` with `salaryPaymentId` null is priced again by the version active on its lesson date (group config first, then general — the `findActiveVersion` choice, in memory). Unchanged prices are not written. Settled lessons and lessons it cannot price (no rate, FIXED_MONTHLY, a percentage with `perLessonCost` 0, a monthly course with no frozen charge) are counted and left alone. The `FIXED_PER_STUDENT` divisor comes from `resolveLessonPricing`. Each changed lesson's live SALARY_ACCRUAL credit is reversed and re-posted, so `User.balance` follows.
- **`POST /salary/config/preview`** (CEO/BD, same gate as the save) runs the whole write and rolls it back (`runRateWrite` in `shared/rate-write-tx.ts`), returning the `RateReapplySummary`. The rate sheet asks before any save that reaches past lessons. Never add an "estimate" path beside it.
- **A live SALARY_ACCRUAL credit is `reversedAt: null` AND `reversedTransactionId: null`.** A reversal row also has `reversedAt` null; `applyAccrualToBalance` / `reverseAccrualBalance` matched it until ADR-0050, which skipped every re-credit after an undo (production: 3 054 live September accruals, 53.9 mln so'm, re-written by the 26.09.2026 monthly-billing migration without their credit; payroll reads the accruals, so pay is unaffected). Past drift is not repaired by that fix.

- `effectiveFrom` (DateTime, mandatory in DTO; defaults to today @ 00:00 Tashkent).
- Reject going backwards: `effectiveFrom < latestVersion.effectiveFrom` → 400.
- Reject inside a closed period: `effectiveFrom` inside an APPROVED/PAID `SalaryPayment` window → 400.
- **Reactivation opens a version.** Deactivation closes the config's last version, and accruals only see a version active on the lesson date, so `PATCH /salary/config/:id` `{ isActive: true }` on an inactive config with no open version writes a new version at the config's current `salaryType`/`value` from `effectiveFrom`, through `upsertNewVersion` and both guards above. That version is checked against the ≤100% PERCENTAGE cap like any rate change, so a legacy row saved above it can be switched off but not back on without a valid value. Flipping only `isActive` would pass `assertTeachersHaveRate` and the readiness `teacherRates` check (both read `isActive`) while the teacher earns nothing. The last CLOSED version counts as "latest" for the backwards check. It is never stretched over the inactive gap, since that would pay the days the config was off. A start inside it cuts it back instead of overlapping it, because `prorateFixedMonthly` sums overlapping versions, i.e. pays twice. `isActive: true` on an active config writes no version.
- **The POST paths reactivate the same way.** `POST /salary/config` on a deactivated config (the rate sheet's save — how the UI sets a rate again after «O'chirish») and `POST /salary/config/global` both take the last closed version as "latest" through `withLatestVersion`, so they get the backwards check and the cut-back above. Loading only open versions let them start a version inside, or before, the closed one.
- **`POST /salary/config/global` is all-or-nothing on the guards.** It has no wrapping transaction, so it checks every teacher (`versionStartRefusal`) before writing for any; one refused teacher refuses the whole batch, naming up to five. Throwing mid-loop left the earlier teachers on the new rate and the rest on the old one. Skipping and listing the refused teachers was rejected: no screen calls this endpoint, so nobody would read the list and those teachers would silently keep the old rate. A change landing between the check and the writes is still refused inside each write's own transaction, and can then stop the loop part-way.
- Lookup: two-query pattern (per-group first, then global) — Postgres NULL ordering with `groupId DESC` is not contractual, so the resolver explicitly tries `groupId = X` then falls back to `groupId IS NULL`.
- `salary-summary.service.ts` and `salary-calculation.service.ts` both use the version table; `FIXED_MONTHLY` payroll reads the version active at `periodEnd`, not the parent mirror, so a future-dated rate change does NOT affect the current cycle.

##### `FIXED_PER_STUDENT` semantics (audit fix)

`value` is what the teacher earns from ONE student over ONE cycle, NOT per lesson: the per-lesson amount is `Math.round(value / divisor)`. It is worked out in `createAccrual` and in the pure `perLessonAccrual` (`salary/shared/deserved-math.ts`), which the gap sweep, the payroll cron, «Berilmadi» and the rate re-pricing share. What a cycle is, and so the divisor, depends on the course:

- **A LESSON_PACK course:** the cycle is one pack and the divisor is the course's `lessonPaymentCount`. The previous bug wrote the full `value` per lesson, inflating teacher pay by `lessonPaymentCount × `.
- **A MONTHLY course (ADR-0050 §2):** the cycle is the MONTH and the divisor is that month's planned lessons (`EnrollmentMonthlyCharge.plannedLessons`, frozen when the month is charged), so a 13-lesson month and a 14-lesson month pay the same per student; dividing by `lessonPaymentCount` would pay a 13-lesson month more. `resolveLessonPricing` (`salary/shared/gap-sweep.ts`) is the one source of that divisor for the gap sweep, the cron and the re-pricing; live attendance (`accrueMonthlySalary`) reads the same `plannedLessons` off the month's charge (or the month plan when there is none) and passes it to `createAccrual` as `lessonDivisor`. A lesson with no frozen charge, priced by its pack marker (ADR-0051), still divides by `lessonPaymentCount`.
- **The breakdown names the unit.** Every line of the salary breakdown (`SalaryBreakdownService`, for a finalised payment and for the current cycle) carries `rateBasis: 'month' | 'cycle'`, set by the SERVER from the lesson's date and the course's payment model. It is `'month'` only for a MONTHLY course whose lesson falls in a monthly-billing month (`isMonthlyBillingMonth`, 2026-09 on); everything else is `'cycle'`, including the May–August lessons of a course that is MONTHLY now but was accrued per cycle then. The client prints «/o'quvchi/oy» or «/tsikl» from it and counts no months. Accepted edge: a September lesson priced from its pack marker also reads `'month'`.

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
  2. Find PRESENT/LATE/ABSENT attendances for `(groupId, date)` — every billable status, `ABSENT` included.
  3. For each: flip status to EXCUSED, set `cancellationId`, run `lessonBillingService.processAttendanceBilling(tx, oldStatus=<its status>, newStatus=EXCUSED)` on the enrollment the charge landed on (`resolveBilledEnrollmentId`) — the reverse algorithm above: accrual reversed, and when consumption existed it is reversed and the prepaid unit (or, for a `SINGLE_UNCOVERED` lesson, the balance) comes back.
  4. **Release the day from every monthly charge that billed it (ADR-0053)** — `MonthlyChargeService.releaseCancelledLesson` → `billing/cancelled-lesson-release.ts`, marked or not. One lesson's price (the departure rule: discounted, capped at `chargedAmount`) goes back to the balance as a `monthly-release` ADJUSTMENT carrying `cancellationId`; the day joins `frozenOutDates`; a student counted EXCUSED that day loses the matching `excusedLessons` credit (the money came back now, not next month). Before this, a student with no attendance mark got nothing — and a lesson the centre never held is the day nobody marks. A day already in `frozenOutDates` is skipped, so a repeat pays nothing. `restoreChargeForReturn` never re-covers a cancelled day.
  5. **Answer «Dars bo'ldimi?» (ADR-0054)** — `markUnmarkedLessonCancelled`: a question waiting for the day (or one answered «Bo'ldi» that a director or the CEO now finds wrong) becomes `NOT_HELD` with the `cancellationId` and its task closes, whichever screen cancelled. After the commit `unmarked-lesson.not-held` sends the Telegram group notice, only when a question row was answered.
- `DELETE /lesson-cancellations/:id` is **soft** and runs Serializable. It does NOT restore the attendance, consumption or accruals `create()` tore down, but it DOES take back the monthly money the cancellation released (ADR-0063, `restoreCancelledLesson` in `billing/cancelled-lesson-release.ts`): each live `monthly-release` ADJUSTMENT carrying its `cancellationId` is reversed, the day leaves `frozenOutDates`, `chargedAmount`/`coveredLessons` come back and a credit the release took (`metadata.creditTakenBack`) is returned. A release whose charge is no longer CHARGED, whose day is billed again, or whose enrollment has any `EnrollmentStateLog` row since (a freeze, departure or transfer may have taken the day out on its own account) is KEPT, and the response and the DELETE history row count it (`keptStudents` / `pulQoldirilganOquvchilar`). Without this a wrong cancellation left its lesson free even after «Bo'ldi»: the day stayed out of the charge (01.10.2026, eight Namangan lessons, 1 667 518 so'm). Then the lesson goes back to «Dars bo'ldimi?» once its time has passed (`reopenAfterCancellationRemoved`, see «Unmarked lessons» above): nobody can enter a register for it any other way, so the administrator answers «Bo'ldi» and marks who came. Deleting a lesson move (`LessonReschedule`) re-asks the same way. The confirm dialog on the group page says so.
- Teacher scope: `GET /lesson-cancellations` requires `groupId`; teacher role is additionally constrained to groups they teach (returns `[]` for unauthorised groups instead of leaking 403/404).

#### Initial Balance (`POST /students/:id/initial-balance`)

CEO-only one-shot for centers transitioning to the new finance system. Writes a single `INITIAL_BALANCE` Transaction; the partial unique index enforces "at most one per student". P2002 is translated to `BadRequestException("Boshlang'ich balans bu o'quvchi uchun allaqachon kiritilgan")`.

#### Balance Withdrawal (`src/withdrawals/`)

Admin-driven drain of a student's positive balance into the centre's account — distinct from `Refunds`, which return money to the student. The amount is **revenue of the month it is withdrawn in** (ADR-0055): the canonical net profit adds it as its own leg, `NetProfit.balanceWithdrawals`, read by `loadBalanceWithdrawals` (`src/reports/balance-withdrawals.ts`, by `createdAt`, branch-scoped). It is never folded into `revenue`, which stays the lesson value that the month-end expectation, the collection ratio and the «Foyda tarkibi» forecast read; on the cash basis it is not added at all (the money counted as «Tushum» when it was paid). Used during onboarding/transition, when a student paid in advance and the rest of the balance must be recognised rather than left "muallaq" (floating), and from the debt page's «Muzlatilgan puli» tab («Markaz hisobiga o'tkazish»).

- **The month is not chosen.** The server books every withdrawal in the current Tashkent month: one `now` drives `Transaction.createdAt`, `metadata.targetMonth` and the teacher accrual's `lessonDate` (the withdrawal day, so it always lands in the open payroll period for any `cycleStartDay`). `CreateWithdrawalDto.targetMonth` is optional and deprecated; any other month is a 400 «Yechib olish faqat joriy oy uchun yoziladi». A past month would have changed that month's reported profit after the fact and parked the teacher's share in a closed payroll period, where the cron never pays it.
- **Endpoints**: `GET /withdrawals/preview/:studentId`, `POST /withdrawals`
- **Roles**: `CEO, Branch Director, Administrator` (class-level `@Roles`)
- **Transaction type**: `BALANCE_WITHDRAWAL` — reduces student balance, metadata stores `{ targetMonth, creditTeacher, teacherUserId, groupId, reason }` for audit
- **`creditTeacher` flag**: when true, also writes a `SalaryAccrual` linked via `deductionTransactionId` to the new BALANCE_WITHDRAWAL row. The accrual has `attendanceId IS NULL` (no underlying lesson) and `lessonDate` = the withdrawal day (Tashkent). The teacher must be on one of the student's active enrollments — service validates this via a `groupTeachers` join and throws `ForbiddenException` otherwise.
- **`SalaryAccrual` schema relax**: `attendanceId` is nullable; the previous unique constraint `(userId, studentId, groupId, lessonDate)` is replaced with `(userId, studentId, groupId, lessonDate, attendanceId)` so withdrawal accruals (NULL attendanceId) can stack within a month — Postgres treats NULLs as distinct in UNIQUE.
- **Atomicity**: balance check + transaction write + student balance update + optional accrual + EntityHistory record run inside one `Serializable` `prisma.$transaction` (10s maxWait, 15s timeout).
- **`To'lovlar` tab**: `BALANCE_WITHDRAWAL` is a money-flow type — included in the comma-separated `?types=` filter. That list is the tab's contract: **every type that moves the balance belongs in it** (`PAYMENT,REFUND,ADJUSTMENT,INITIAL_BALANCE,BALANCE_WITHDRAWAL,LESSON_DEDUCTION,DISCOUNT_ADJUSTMENT,DEBT_WRITE_OFF,MOCK_EXAM_FEE`) — a missing type shows the balance jumping with no visible cause, which is what hid 37 rows worth 4 296 450 so'm. Adding a new balance-moving `TransactionType` means adding it here AND to `TRANSACTION_TYPE_INFO` on the client. The `Lesson Trail` endpoint continues to scope strictly to `LESSON_DEDUCTION` + `LESSON_CONSUMPTION`.
- **Salary calculation**: existing `salary-summary` and `salary-calculation` queries pick up withdrawal accruals automatically (filter is `salaryPaymentId: null, reversedAt: null` + `lessonDate` range), so no special-case logic. The withdrawal day as `lessonDate` puts the accrual in the payroll period that is open when it is written.

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

Per-student "where did each so'm go for lessons?" report. Strictly scoped to `LESSON_DEDUCTION` (prepaid-batch allocation rows) and `LESSON_CONSUMPTION` (per-lesson use rows) — money-flow types (PAYMENT/REFUND/ADJUSTMENT/INITIAL_BALANCE) are filtered out at the service level. Paginated (`page`, `pageSize`). Returns rows in ASC order (chronological story) enriched with attendance metadata (date, group, course) and reversal markers. No screen reads it now: the «Darslar» tab reads `GET /students/:id/lessons-overview` (`getLessonsOverview`: month blocks from the first monthly charge on, pack cycles before — ADR-0062).

#### Student transactions list (`GET /transactions/student/:id`)

Used by the "To'lovlar" tab. Accepts a `types` query parameter — a comma-separated list of `TransactionType` values (e.g. `?types=PAYMENT,REFUND,ADJUSTMENT,INITIAL_BALANCE,BALANCE_WITHDRAWAL,LESSON_DEDUCTION`) — so the tab can request only the rows that move the balance. Validated against the enum at the DTO boundary; invalid tokens reject. The legacy single-`type` parameter still works as a fallback for one type.

**Tab overlap on `LESSON_DEDUCTION` (intentional).** `LESSON_DEDUCTION` is a real money-flow row — it decreases the student balance — so it appears on **both** the "To'lovlar" tab (so a balance drop is never unexplained, e.g. a payment immediately consumed by retroactive billing) **and** the "Darslar" tab (where it shows which prepaid batch covered which lessons). It is the **one** `TransactionType` deliberately shared between the two tabs. `LESSON_CONSUMPTION` (amount=0, no balance movement) stays exclusive to the "Darslar" tab. Every other type belongs to exactly one tab.

#### Enrollment Lifecycle Prepaid Refund (`EnrollmentBillingService`)

When an enrollment closes (TRANSFERRED or DROPPED), unused prepaid lessons are converted back to balance. **Original** `perLessonCost` (from the most recent unreversed `LESSON_DEDUCTION.metadata.perLessonCost`) is used so course price changes after the deduction don't affect the refund. Falls back to the current course price for legacy rows without metadata.

- `removeFromGroup()`: refund + flip to DROPPED in one tx.
- Group deletion and a group's own CANCELLED/COMPLETED: the same refund for every enrollment they close, inside that operation's transaction — one failed refund rolls the whole operation back (ADR-0041). The branch, course and student cascades instead refund each enrollment in its own transaction and log a failure, so one bad enrollment does not hold up a batch of hundreds.
- Transfer (`enrollToGroup` with existing enrollment): refund old enrollment + close TRANSFERRED + create new enrollment + state log — all in a single Serializable transaction so we never end up with prepaid stranded on a closed enrollment.
- **A MONTHLY transfer also cuts the old enrollment's current-month charge** back to the lessons held up to the transfer (`MonthlyChargeService.reverseChargeForDeparture`, the same call `removeFromGroup` makes). Without it the student paid the old course's FULL month on top of the new course's prorated share — a mid-October Standart → Intensive switch billed 853 636 instead of 611 331 (CEO 21.09, answer 13: each course at its own price over its own lesson count). `refundPrepaidToBalance` alone is a no-op on a MONTHLY enrollment.
- **Contract 6.2 (ADR-0043, replaced by ADR-0044): a student's own departure after more than 40% of the month keeps the month's charge; a completed level does not.** `reverseChargeForDeparture` takes a `policy`: `STUDENT_CANCELLED` (the default of a group removal and of an expulsion), `LEVEL_COMPLETED` (the student finished the level — certificate or next level later: the contract is fulfilled, not cancelled, so the unheld lessons come back; contract 3.4), `CENTER_INITIATIVE` (the unheld lessons come back — what every caller that passes nothing gets, i.e. freeze, transfer, group/branch/course closings, group deletion and a card archive) and `QUALITY_CLAIM` (the whole month back). The rule is ONE pure function, `policyRelease` (`billing/departure-policy.ts`), shared by the write and `previewDepartureOutcomes`, which backs `GET /students/:id/departure-preview` and the «Pul (shartnoma bo'yicha)» block in both dialogs — never recompute a departure's money anywhere else. Share = covered lessons held through the departure day ÷ covered lessons, frozen-out dates excluded from both; «more than» is strict; the threshold is `payment.noRefundAfterPercent` (company-level, default 40); departures before `CONTRACT_62_START_DAY` (01.10.2026) keep the old rule; a month with nothing left to return is never reported as withheld. `LEVEL_COMPLETED` is open to everyone who may remove a student (`OPEN_DEPARTURE_POLICIES`) and refused on an expulsion (400); only a CEO or Branch Director may send `CENTER_INITIATIVE` or `QUALITY_CLAIM` (`assertMayChooseDeparturePolicy`, read from the database — ADR-0028, 403 otherwise); a policy with any status but EXPELLED is a 400. A card ARCHIVE is not a departure (a record made by mistake) and keeps the old rule. The student's and the group's history rows carry a `pul` line (`departureMoneyNote`); teacher accruals are never touched by any policy.
- **A MONTHLY return is charged only for the lessons after the return day**, whether or not its month already has a charge. A student frozen when a month's charge run went by has no row for that month; `restoreChargeForReturn` then creates it at the unfreeze, and the daily run (`createChargesForPeriod`) starts any later charge after the same day (`chargeStartDate`). Before this the unfreeze charged nothing and the next 04:00 run billed the whole month from the join date, frozen weeks included. The daily run reads the return from `Enrollment.statusChangedAt`: on an ACTIVE enrollment it is the moment it last came back to ACTIVE, so write `statusChangedAt` only together with a real status change.
- **The enroll dialog asks the server what adding the student would charge (A3.4).** `GET /students/:id/enroll-preview?groupId=&startDate=` (`StudentEnrollPreviewService`; CEO / Branch Director / Administrator, the roles of `POST /students/:id/enroll`, the call it previews). `startDate` is the optional `YYYY-MM-DD` the dialog would send, today when omitted, as in `enrollToGroup`. It writes nothing, checks the student's branch, then the group's (the enroll call checks only the group's branch: a student of another branch is refused, a student with none takes the group's), and answers `{ paymentModel, coursePrice, lessonPaymentCount, discountPercent, firstMonth, balance, transferRelease, payable }`. The client prints these and adds nothing up (`client/src/components/students/enroll-preview-block.tsx`).
  - **MONTHLY quotes the FIRST charge the student will actually get**, which is not always this month's. The month is that of the later of today and the charge's first day (`chargeStartDate`: the chosen start, never before the group's own start): a first day in a later month is charged by that month's run, any other by the enroll call itself, in the current Tashkent month (`chargeMidMonthJoin`). When that month leaves nothing to charge — no lesson from the first day on, or every one already paid by another charge of the student in the same group — the quote rolls forward ONCE, to the next month, never further. Only a MONTHLY course in an ACTIVE group rolls: the service's gate mirrors the refusals of `previewChargeForNewEnrollment` (not MONTHLY, group not ACTIVE), so that past it that method's `null` can only mean "nothing to charge" — a refusal added to one must be added to the other. `firstMonth` is null for a pack course (it has no first month), and for a MONTHLY one when the group is not ACTIVE yet or two months in a row have nothing to charge.
  - **The amount is the write's own.** `MonthlyChargeService.previewChargeForNewEnrollment` and `createChargeForEnrollment` both call `planChargeAmounts` (the month's plan, the proration and the student's discount), so the dialog cannot quote a sum the write does not charge: change that arithmetic there and nowhere else. The quote never adds excused credit, because a new enrollment has none carried over from an earlier month; it is the discounted, prorated price.
  - **`payable = max(0, due − (balance + transferRelease))`**, where `due` is `firstMonth.amount` for MONTHLY (0 when `firstMonth` is null) and, for LESSON_PACK, the pack price at the student's discount (`applyDiscount`), the amount pack billing deducts for a full cycle.
  - **`transferRelease` is what a transfer gives back from the old group's month** before the new group is charged. A student ACTIVE in another group is transferred: `enrollToGroup` closes that enrollment (one live ACTIVE enrollment per student) and calls `reverseChargeForDeparture` with no policy — CENTER_INITIATIVE, and never contract 3.5's trial lesson, which is for a student leaving. The quote takes it from `previewReleaseForDeparture`, that call's read-only twin, not from `previewDepartureOutcomes`, which applies the trial lesson under every policy and would quote a first-timer's whole month. 0 when the student is in no other group, or when the old month has no standing charge or nothing left to give back. A pack enrollment's prepaid refund (`refundPrepaidToBalance`) is left out, as no pack courses remain, which is why the dialog still calls the figure «To'lash kerak (taxminan)».
- **A join month is charged when the enrollment is written, by every door.** The admin door does it in its own transaction (`StudentEnrollmentService.chargeMidMonthJoin`). The Telegram self-registration writes the enrollment itself and cannot import `BillingModule` (BillingModule → TelegramDigestModule → TelegramModule), so `registerStudentFromTelegram` emits `STUDENT_SELF_ENROLLED` and `SelfEnrollmentChargeListener` calls `MonthlyChargeService.chargeJoinMonth`. Left to the 04:00 daily run, a sign-up on a month's last lesson day was never billed for it, because the next run already bills the new month (30.09.2026: five students). A new door that writes an enrollment charges its join month one of these two ways.

#### Payment Reverse Block

`payments-write.service.ts:reverse()` refuses if any non-reversed `LESSON_CONSUMPTION` exists for the student dated AFTER the payment landed. The funds are already spent on lessons — admins must use the formal `Refund` flow (which has proper math for partial completion + deductions). Force-reverse is intentionally not provided to prevent ledger drift.

#### Payment Amount Correction

`payments-write.service.ts:correctAmount()` (`POST /payments/:id/correct`) fixes a wrong amount on a manual payment (e.g. cashier typed 4 000 000 instead of 400 000). It is **reverse + re-post**, not an in-place edit — the append-only ledger rule holds. The original payment becomes `REVERSED`; a fresh payment is created at the correct amount. The two steps run as separate Serializable transactions (not one atomic unit); if the re-post fails, a precise recovery message is surfaced.

- **Roles**: CEO, BD, Admin (`@Roles` on the endpoint excludes Cashier).
- It also fixes a wrong **payment method** (`method` optional in `CorrectPaymentDto` — when omitted the original method is kept). Amount and method can be corrected together or independently.
- **Method-only correction is an in-place update, NOT reverse + re-post.** When the amount is unchanged (only the method differs), the balance never moves, so `correctAmount()` early-returns after a single Serializable tx that just updates `Payment.method` (+ `recordUpdate` audit + CEO alert). The ledger (`Transaction`) stores balances, not the method, so no ledger row changes. **Consequence:** the "funds already spent on lessons" guard does NOT apply to a method-only fix — a mis-recorded method (e.g. CASH → TRANSFER) can be relabelled even after the money was consumed by lessons. The reverse+re-post path (and its consumption guard) is reached only when the **amount** changes.
- **Guardrails** (all enforced in the service): only `ADMIN_MANUAL` source (gateway amounts are provider-owned); only `COMPLETED` status; amount and/or method must differ; non-CEO callers bound to a **72h window** after the payment landed (`ADMIN_CORRECTION_WINDOW_HOURS`, CEOs bypass); **on an amount change** blocked when funds were already spent on lessons (`LESSON_CONSUMPTION` exists) — that needs the CEO lesson-deduction unwind flow.
- A `reason` is **mandatory only when the amount changes** (an amount fix must be explained in the audit trail). A **method-only** correction (money unchanged, e.g. CASH → TRANSFER) needs no reason — the service enforces this. When given, the reason lands in the audit trail and the re-posted payment's `note` records the previous amount + reason.
- **Student notifications**: two instant Telegram messages (ADR-0065) — `payment.reversed` (old payment rolled back) then `payment.received` (new payment posted).
- **CEO alert**: when a non-CEO performs the correction, `payment.corrected` is emitted → `NotificationEventsListener` notifies all company CEOs (DB + SSE + Push instantly, Telegram through the 20:00 digest; `NotificationType.SYSTEM`).

#### Status Transitions (centralized in `src/common/finance/status-transitions.ts`)

- `assertValidTransition(entityType, map, fromStatus, toStatus)` — throws `BadRequestException` if invalid
- Used across: payments (reverse), refunds (process), salary (approve/pay), contracts (status change)

#### RBAC for Financial Features

| Feature                                          | CEO | BD  | Admin | Cashier | Teacher |
| ------------------------------------------------ | :-: | :-: | :---: | :-----: | :-----: |
| Create payment                                   | ✅  | ✅  |  ✅   |   ✅    |   ❌    |
| Reverse payment                                  | ✅  | ❌  |  ❌   |   ❌    |   ❌    |
| Correct payment amount                           | ✅  | ✅  |  ✅   |   ❌    |   ❌    |
| Salary config (BD: own-branch teacher, ADR-0034) | ✅  | ✅  |  ❌   |   ❌    |   ❌    |
| Calculate salary                                 | ✅  | ❌  |  ❌   |   ❌    |   ❌    |
| Approve salary                                   | ✅  | ❌  |  ❌   |   ❌    |   ❌    |
| Pay salary                                       | ✅  | ✅  |  ❌   |   ❌    |   ❌    |
| Create refund                                    | ✅  | ✅  |  ✅   |   ❌    |   ❌    |
| Reverse refund                                   | ✅  | ❌  |  ❌   |   ❌    |   ❌    |
| Create expense                                   | ✅  | ✅  |  ❌   |   ❌    |   ❌    |
| Financial reports                                | ✅  | ✅  |  ❌   |   ❌    |   ❌    |
| Debt page reads (history, aging, write-off list) | ✅  | ✅  |  ✅   |   ✅    |   ❌    |
| Debt page «Markaz qoplagani» tab                 | ✅  | ✅  |  ✅   |   ✅    |   ❌    |
| Log call result (`POST /call-logs`)              | ✅  | ✅  |  ✅   |   ❌    |   ❌    |
| Salary page reads (`/payments/salary`)           | ✅  | ✅  |  ❌   |   ❌    |   ❌    |

### Comments & Task Assignment

- `CommentsModule` (`src/comments/`) — comments and task assignment system
- **Comment** table: polymorphic `entityType`/`entityId` (same pattern as EntityHistory)
- **CommentAssignee** table: users assigned to a task, each with their own status (PENDING → SEEN → DONE)
- **Permissions**: Regular comments — CEO, BD, Admin. Task comments — CEO, BD, and Admin. Administrator was added to the task-creation gate so the /outreach (Aloqa markazi) workflow is usable for the role that actually runs it day-to-day.
- **Endpoints:**
  - `POST /api/comments` — create comment/task
  - `GET /api/comments?entityType=Student&entityId=12345&page=1&pageSize=20` — list by entity
  - `GET /api/comments/latest?entityType=Student&entityId=12345` — latest comment (for Eslatma/reminder section)
  - `PATCH /api/comments/:id` — edit content, due date, priority; the author or the CEO only (the route admits CEO/BD/Admin, the service refuses anyone else)
  - `DELETE /api/comments/:id` — CEO only (`@Roles('CEO')`; there is no author path, so an author cannot delete their own comment or task)
  - `PATCH /api/comments/:id/assignee-status` — assigned user updates their own status
- Comment creation/deletion is recorded in the audit log via `EntityHistoryService`
- Events are emitted via `@nestjs/event-emitter`: `comment.created`, `task.assigned`, `task.status.changed`
- **`Comment.authorId` is nullable: a system task («Dars bo'ldimi?», ADR-0054) has no author.** Code that reads `comment.author` must handle `null` and show «Tizim» (the leads latest-comment, the task reminder and the client cards do); `CommentsService.update` / `delete` refuse a system task (400) and `updateAssigneeStatus` claims it for the first administrator to act — see «Unmarked lessons» under Attendance
- `TaskReminderService` cron sends "deadline approaching" notifications 1h before `dueDate`. Runs once per hour on the hour, only during business hours and on working days (`'0 0 8-18 * * 1-6'`, Asia/Tashkent — fires at 08:00, 09:00, …, 18:00 Monday–Saturday). Sundays and active holidays (via `HolidaysService.findActiveHolidayCovering`, any branch) are skipped — but holidays are stored at UTC midnight and the check passes the current time, so only the non-final days of a multi-day holiday are actually skipped. The DB autosuspends outside this window. **Task dueDate is enforced to fall inside this same window** — `CommentsService.create` and `update` reject any `isTask=true` task with `dueDate` outside 08:00–18:00 Tashkent or on a Sunday with `BadRequestException`, so every task reminder is guaranteed a cron tick within 1h of its deadline.

### Notifications (4 channels)

- `NotificationsModule` (`src/notifications/`) — notification system
- **Notification** table: per-user notifications (userId, type, title, message, isRead)
- **PushSubscription** table: browser push subscription data
- **4 delivery channels:**
  1. **DB** — all notifications are persisted
  2. **SSE (Server-Sent Events)** — real-time, `GET /api/notifications/stream` (fetch-based, with JWT Authorization header)
  3. **Web Push** — works even when browser is closed, via `web-push` library and VAPID keys
  4. **Telegram** — queued for the 20:00 digest (see "Telegram digest" below) and delivered only if the recipient has a `telegramChatId` at send time; `payment-promise.overdue` (09:00) is the one listener event still sent instantly
- **SSE Gateway** (`notifications.gateway.ts`): userId → Response mapping, 30s heartbeat
- **Event Listener** (`notification-events.listener.ts`): fans out events to all 4 channels (DB/SSE/push instantly, Telegram through the digest queue)
- **Endpoints:**
  - `GET /api/notifications?page=1&pageSize=20` — current user's notifications
  - `GET /api/notifications/unread-count` — unread count for badge
  - `PATCH /api/notifications/:id/read` — mark as read
  - `PATCH /api/notifications/read-all` — mark all as read
  - `GET /api/notifications/stream` — SSE stream
  - `POST /api/notifications/push/subscribe` — push subscription
  - `DELETE /api/notifications/push/unsubscribe` — push unsubscribe
  - `GET /api/notifications/vapid-public-key` — VAPID public key

#### Telegram digest — one message a day at 20:00 (ADR-0025)

Event-driven Telegram notifications no longer go out when the event happens. The listener enqueues a `TelegramDigestItem` row through `TelegramDigestQueueService.enqueue` (`src/telegram-digest/`), with a typed payload per `TelegramDigestCategory` (`telegram-digest-payloads.ts`), and two crons send the queue at **20:00 Asia/Tashkent**. The DB/SSE/push legs of the same events stay instant.

- **Personal** (`recipientKind` `STUDENT` / `USER`): `TelegramDigestPersonalCronService`, main bot, **every day, Sundays and holidays included**. One message per recipient, split into parts of at most 4000 characters. It covers enrollment and removal, debt charges, tasks, payment corrections (the CEO alert), salary carry-over and the teacher's attendance-completed stats. Debt lines are re-checked against live data at 20:00: a student who has paid since, or whose charge was reversed, gets no debt line.
- **Monthly payment messages** (ADR-0042): `MonthlyPaymentNoticeCronService` queues them at 19:50, before the personal cron sends. `MONTHLY_CHARGE` — the month's bill, once per charge (`EnrollmentMonthlyCharge.noticeQueuedAt` is claimed in the same transaction as the queue write; a re-charge clears it) and only for the student's FIRST standing charge of the month — a mid-month transfer's second charge is marked, never announced. `PAYMENT_REMINDER` — the evening before a debtor's 2nd lesson of the month, counted from their first covered lesson of the month in any group, on the group's live calendar (the bill's «Muddat» uses the same rule). At 20:00 the renderer takes the debt and the total from the live balance and drops a bill whose charge was reversed or whose student left or froze, and a reminder for a student who paid or for a day that is no longer tomorrow. Texts: `telegram-digest/monthly-payment-text.ts` (CEO-approved, do not reword). Switch: `payment.monthlyNoticesEnabled`.
- **Contract 3.7 and the least share in the notices (ADR-0064).** The same 19:50 run calls `queuePaidThroughReminders`: a `PAYMENT_REMINDER` row carrying `paidThrough` for every part payer whose first lesson of the month the payments do not reach (`LessonAdmissionService.reachForMonth`) is 1 to `payment.paidThroughReminderDays` days ahead — so on each of those evenings until a payment moves that lesson. None for a student already out (that lesson is today or behind), one short of the least share, or one who has paid nothing of the month; one row per student. No new digest category, so no migration: the payload decides the wording. The renderer sends such a row only on the day it was queued for, and not on an evening the 2nd-lesson reminder goes out (one reminder a day). Its lesson dates are as of 19:50; the amount is the live balance. From 01.11.2026 with a least share above 0, `queueReminders` reminds only a student tomorrow's lesson does not admit (`forLesson`, the register's own verdict) and the bill adds «Imkoni bo'lmasa, kamida …» under its «Muddat» (`leastDue`, the payload's `minShare`). **Every payment text asks for the whole amount first; the least share is the fallback, never an offer** (CEO, 02.10.2026): the bill's «Muddat» stays the whole month by the 2nd lesson, and the 2nd-lesson reminder leads with «To'lash kerak» before «Darsga kirish uchun kamida». With `payment.admissionRuleEnabled` off the cron passes 0 and queues no 3.7 reminder. Known limits: a student of two groups is billed for the first charge only (above), so that bill's «kamida» includes the second group's whole charge; "tomorrow is the 2nd lesson" comes from the live calendar while admission reads the charge's `coveredDates`, so a lesson moved to an earlier day leaves those students without the 2nd-lesson reminder.
- **Group** (`recipientKind` `GROUP`, `recipientId` = companyId): `TelegramGroupDigestCronService`, admin bot, **skips Sundays and holidays** (rows wait for the next working day). One message per approved group: new students, payments at or above `LARGE_PAYMENT_THRESHOLD_SUM` (500 000) or paid online, new groups, and status changes with their reason and actor. Visibility is `isVisibleToGroup`, fail-closed for a branch-less group. Delivery is tracked per chat in `deliveredGroupIds`, so a transient failure is retried next run for the chats that missed it and never resent to the ones that got it.
- **Recipients are resolved at 20:00, not at enqueue**: students by `deletedAt: null` only (a frozen, departed or graduated student still receives, a CEO decision), staff by the full active filter.
- **Failures** (`telegram-send.ts`): permanent (403, chat gone) → dropped; content (our own bug: too long, bad HTML) → kept and logged as an error; transient (network, 5xx, 429) → kept for the next run. A 429 waits `retry_after` (at most 30 s) and retries once. Every run first purges rows older than 7 days.
- **Audit**: a student send writes `SmsMessage` plus an `SMS_YUBORILDI` / `SMS_YUBORILMADI` history row, exactly as `SmsService` does, so the profile's «SMS» tab keeps working.
- **Instant by design** (ADR-0025's list): the payment receipt and its reversal (ADR-0065), lesson cancel/reschedule, the «Dars bo'lmadi» group notice (ADR-0054 — sent through `sendTelegramText` by `TelegramGroupUnmarkedLessonListener`), bot flows (OTP, registration), attendance reminders, `payment-promise.overdue` (09:00), the 21:00 report, product news and auto-pause messages. `src/telegram-digest/direct-send.guard.spec.ts` freezes who may call `.sendMessage(` directly; adding a new instant sender is a product decision, so put it on the spec's and ADR-0025's instant list first.

#### A student's chat can refuse the bot (ADR-0066)

`Student.telegramDisconnectedAt` is when the bot learned the linked chat no longer takes its messages — the student blocked the bot or deleted the Telegram account. Null = reachable. **The link itself is never removed**: a Telegram user's chat id survives a block, so an unblock needs no new registration and the Mini App still recognises the chat. A student the bot can reach is `telegramChatId` set AND `telegramDisconnectedAt` null.

- **`StudentChatReach` (`telegram/utils/student-chat-reach.ts`) is the one writer**, wired in `TelegramService.onModuleInit`. It learns the state two ways: a private chat's `my_chat_member` update (`kicked` = blocked, `member` = unblocked), and `watch(bot.telegram)`, which wraps the bot's own `callApi` so EVERY send — digest, SMS, cancellations, statements, mock results, anything added later — reports its outcome. A failure `classifyTelegramError` calls permanent marks the chat; a delivered `send*`/`copy*`/`forward*` clears it, so an unblock the bot missed heals on the next message. Do not add a per-sender check instead: the chokepoint is what keeps a new sender covered.
- **The state belongs to the chat, not one card.** Every live card linked to the chat is marked or cleared together (a parent's chat serves siblings), each conditionally (`updateMany … telegramDisconnectedAt: null`), with a `TELEGRAM_UZILDI` (`sabab`) / `TELEGRAM_QAYTA_ULANDI` Student history row and no actor.
- **Sends to a marked chat are NOT skipped.** The mark is what staff see and count; skipping would silence a student forever if the unblock update were ever lost (debt reminders and receipts included). A few extra 403s are the price.
- **The database write is not awaited** inside the wrapped `callApi`, and its errors are only logged: a send made inside a transaction must never wait on a row lock that same transaction holds, and bookkeeping must never fail a send. Only the bot's own client is wrapped — a reply inside a handler goes through Telegraf's per-update client, and a person who just wrote to the bot has not blocked it.
- **Every write of a student's `telegramChatId` clears the mark in the same write** (`linkChat` in `statement-flow.ts`, `linkChatIdToStudent` in `password-reset-flow.ts`): the person is writing to the bot at that moment. That is also how a student who deleted their Telegram account comes back with a new one.
- The migration `20260930120000_student_telegram_disconnected` backfilled the mark from each chat's latest real attempt in `SmsMessage` (52 live cards on production, 30.09.2026).

### Custom Form Submissions (`src/custom-forms/`)

Every public form submission creates a lead and a `CustomFormSubmission` row (`data` keyed by `FormField.id`). Admin read endpoints on `CustomFormsController` (`@Roles('CEO','Branch Director','Administrator')`, `@BranchScope()`):

- `GET /custom-forms` — each form also carries `lastSubmittedAt`, `convertedCount`, `awaitingCallCount` (three `groupBy` queries, independent of form count).
- `GET /custom-forms/:id/submissions` — paginated responses (`submittedAt DESC`) with `?stage` (one value), `?source` (comma ids, `none` = no source), `?search` (name tokens; a digits-only query is ONE phone number with a leading `998` stripped), `?startDate/endDate` (Tashkent days). Returns whole-form `counts.stages` + `counts.sources` (never affected by filters), current extra `fields`, and `legacyFields` (answers to fields since deleted from the form).
- `GET /custom-forms/:id/submissions/export` — same filters, no pagination, max 5000 rows.
- `GET /custom-forms/:id` no longer returns `submissions`.

Rules:

- **`submission-stage.ts` is the single definition of a submission's stage.** Priority: `converted` (CONVERTED) → `lost` (no lead, LOST/ARCHIVED, or `deletedAt` set) → `contacted` (`calledAt` set, or TRIAL/CONTACTED) → `awaiting`. `submissionStage()` classifies a row in memory; `stageWhere()` builds the matching Prisma filter. The spec evaluates `stageWhere` against every `statusEnum × deletedAt × calledAt × no-lead` combination and asserts exactly one stage matches and equals `submissionStage` — so chip counts and table rows cannot drift. Change both functions together or the test fails.
- **Branch scope is the form's chain**: `form → section → column → branchIdWhere(scope)`, identical to `findOne`; every later query is anchored on the already-scoped `formId`.
- `isRepeat` marks a lead whose phone already existed EARLIER as another lead's `phone` or `extraPhone` (company-wide). It is a badge only — lead creation is unchanged.
- A lead hard-deleted from the archive leaves `leadId = null` (optional FK); such a submission is `lost`, and `submitted` still carries the name/phone taken from the form answers.
- Known cost: `findLegacyFields` scans the `data` of every submission of the form per request. Fine at current volumes (largest form ≈ 45); bound it before any form grows into thousands.

### Student Search & Filters

- **Unified search** (`?search=`): searches across `firstName`, `lastName`, `phone`, and `id` (numeric) in a single query — the frontend sends one search string for all fields
- **Status filters** (`?status=`): `active`, `frozen`, `ungrouped`, `graduated`, `expelled` — each maps to specific `where` conditions in the service
- **Branch filter** (`?branch_id=`): filters students by their enrollment branch
- `ungrouped` = active students with zero enrollments
- `graduated` and `expelled` map directly to `StudentStatus.GRADUATED` and `StudentStatus.EXPELLED`

### Error Handling

- Use NestJS built-in exceptions (`NotFoundException`, `ForbiddenException`, `BadRequestException`, etc.)
- Never expose internal error details to clients
- **A Telegram error can carry the bot token.** A Bot API call goes to `…/bot<token>/<method>`, and Telegraf redacts that URL only when the request itself fails — a non-JSON reply or a body cut off or timed out still quotes it. `installBotTokenRedaction()` (`telegram-digest/telegram-send.ts`, the first line of `main.ts`) strips `bot<id>:<secret>` from the message and stack of every error a Telegram call throws, both bots and `ctx.*` included. Text that is stored or shown goes through `describeError`, which applies the same rule; never write a raw `err.message` from a Telegram call to the database.

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
- **…and must mirror the block into the guard's cache.** After the database write, call `recordUserBlocked(this.redis, id, isBlockedStatus(dto.status))` (an archive passes `true`) from `common/auth/blocked-user.ts`. Without it a suspended, terminated or archived employee keeps using their access token for up to an hour (ADR-0028). `BLOCKED_USER_STATUSES` in the same file is the one list of statuses that block — the guard reads it too
- **Never write a DTO that exposes `isActive` directly** — it is a derived field. Callers pass `status`; the service derives `isActive`
- When archiving (soft delete), force both: `status: UserStatus.ARCHIVED, isActive: false, deletedAt: <now>`. Write `data: userArchiveData(deletedById)` from `common/status/user-archive.ts`, which both archive doors (`UsersService.softDelete`, `TeachersService.delete`) use and which also records the archive as the latest status change. Import it by path, not through the `common/status` barrel (that barrel is in an import cycle with `UsersService`). The employee door once wrote only `deletedAt`, leaving archived employees `ACTIVE`
- When restoring from archive, force both: `status: UserStatus.ACTIVE, isActive: true, deletedAt: null`
- Backfill script: `server/scripts/backfill-user-isactive.ts` (supports `--dry-run`) — run after any schema migration that may introduce drift. It only syncs `isActive` to `status`; it does not catch an archived row whose `status` was never set to `ARCHIVED`
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
| `TELEGRAM_MINI_APP_URL`                    | Student portal Mini App address, `https://student.dafzentrum.uz/tg` (ADR-0040). Unset = «Platformaga kirish» stays "tez kunda" and the menu button is left alone. Must be `https:` (validated at boot). Each boot with it set installs the bot's default menu button «Kabinet»; removing it does not reset that button — do it in BotFather. The staff cabinet (ADR-0045) uses the same path on the `lehrer.`/`admin.` host of this URL, so it is on only while this is set on a `student.` host.                                                                                                                              | —                            |
