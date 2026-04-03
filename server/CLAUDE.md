@AGENTS.md

# DaF Sprachzentrum — ERP System (Backend)

An ERP system for **DaF Sprachzentrum** language school. Backend API serving the frontend client.

> **Roles:** CEO, Branch Director, Administrator, Teacher, Cashier. The system supports **multiple branches** (filials).
> Roles are stored in a `Role` table with fixed IDs (1–5), linked to users via `UserRole` join table (many-to-many).

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
- Use `PrismaService` for all database access — no raw SQL
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

### Portal-Based Role Restriction (Subdomain Routing)

The system uses **subdomain-based portals** — each subdomain restricts login to specific roles:

| Portal | Domain | Allowed Roles |
|--------|--------|---------------|
| Admin panel | `admin.dafzentrum.uz` | CEO (1), Branch Director (2), Administrator (3), Cashier (5) |
| Teacher portal | `lehrer.dafzentrum.uz` | Teacher (4) |
| Student portal | `student.dafzentrum.uz` | Not yet implemented |

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

#### Backend role-check pattern

Use `@Roles()` decorator with **string role names** + `RolesGuard`:

```typescript
@UseGuards(RolesGuard)
@Roles('CEO', 'Branch Director', 'Administrator')
```

#### Key access rules

- **Salary/financial endpoints** — restrict to `@Roles('CEO', 'Branch Director')` only
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

| Entity | create | update | statusChange | delete | restore |
|--------|--------|--------|--------------|--------|---------|
| Student | ✅ | ✅ | ✅ | ✅ | ✅ |
| Group | ✅ | ✅ | ✅ | ✅ | ✅ |
| Branch | ✅ | ✅ | ✅ | ✅ | ✅ |
| Room | ✅ | ✅ | ✅ | ✅ | ✅ |
| Course | ✅ | ✅ | ✅ | ✅ | ✅ |
| User | ✅ | ✅ (profile) | — | — | — |
| Holiday | — | — | ✅ | — | — |

### Comments & Task Assignment

- `CommentsModule` (`src/comments/`) — izohlar va topshiriqlar tizimi
- **Comment** jadvali: polymorphic `entityType`/`entityId` (EntityHistory pattern bilan bir xil)
- **CommentAssignee** jadvali: topshiriq assign qilingan foydalanuvchilar, har birining alohida statusi (PENDING → SEEN → DONE)
- **Ruxsat**: Oddiy izoh — CEO, BD, Admin. Task izoh — faqat CEO va BD
- **Endpoints:**
  - `POST /api/comments` — izoh/topshiriq yaratish
  - `GET /api/comments?entityType=Student&entityId=12345&page=1&pageSize=20` — entity bo'yicha ro'yxat
  - `GET /api/comments/latest?entityType=Student&entityId=12345` — eng so'nggi izoh (Eslatma uchun)
  - `DELETE /api/comments/:id` — muallif yoki CEO o'chira oladi
  - `PATCH /api/comments/:id/assignee-status` — assign qilingan user o'z statusini o'zgartiradi
- Comment yaratish/o'chirish `EntityHistoryService` orqali audit log ga yoziladi
- `@nestjs/event-emitter` orqali event chiqariladi: `comment.created`, `task.assigned`, `task.status.changed`

### Notifications (4 kanal)

- `NotificationsModule` (`src/notifications/`) — bildirishnomalar tizimi
- **Notification** jadvali: har bir foydalanuvchi uchun bildirishnomalar (userId, type, title, message, isRead)
- **PushSubscription** jadvali: browser push subscription ma'lumotlari
- **4 ta yetkazish kanali:**
  1. **DB** — barcha bildirishnomalar saqlanadi
  2. **SSE (Server-Sent Events)** — real-time, `GET /api/notifications/stream` (fetch-based, JWT Authorization header bilan)
  3. **Web Push** — browser yopiq bo'lganda ham, `web-push` kutubxonasi, VAPID kalitlar orqali
  4. **Telegram** — `TelegramService.getBot().telegram.sendMessage()` orqali, faqat `telegramChatId` mavjud bo'lsa
- **SSE Gateway** (`notifications.gateway.ts`): userId → Response mapping, 30s heartbeat
- **Event Listener** (`notification-events.listener.ts`): event larni 4 kanalga fanout qiladi
- **Endpoints:**
  - `GET /api/notifications?page=1&pageSize=20` — o'z bildirishnomalar
  - `GET /api/notifications/unread-count` — badge uchun o'qilmagan soni
  - `PATCH /api/notifications/:id/read` — o'qilgan deb belgilash
  - `PATCH /api/notifications/read-all` — barchasini o'qilgan
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
- Hard maximum: **500 lines**
- If a file grows too large — split into smaller, focused parts

### Lazy Data Loading for Tabs

- When the frontend uses tabs (e.g. profile pages with "Profil", "Guruhlar", "Ish haqi"), each tab's data is fetched **only when the user switches to that tab** — not all at once on page load
- Design API endpoints for tab-specific data as **separate routes** (e.g. `GET /api/teachers/:id/groups`) rather than embedding everything in the main entity response
- This keeps the main entity endpoint fast and avoids loading data the user may never need

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

## Available Skills

Skills are specialized knowledge modules that **must** be activated when working on related tasks. Before starting any task, identify which skills are relevant and invoke them.

### Slash Commands (`.claude/commands/`)

| Command | When to use |
|---------|-------------|
| `/deploy` | Vercel + Railway + Auto-Merge deploy qilish |
| `/restart` | Dev serverlarni qayta ishga tushirish |
| `/team-deploy` | Xavfsiz jamoa deploy |
| `/team-merge` | Xavfsiz PR merge |

### Context7 Skills (auto-triggered)

| Skill | When to use |
|-------|-------------|
| `nestjs-best-practices` | NestJS module, DI, security, architecture patterns |
| `typescript-expert` | TypeScript type-level programming, performance, migration |
| `prisma-cli` | Prisma CLI: migrate, generate, seed, studio |
| `prisma-client-api` | Prisma query, filter, CRUD, client configuration |
| `prisma-database-setup` | Prisma + PostgreSQL/MySQL/SQLite ulanish va sozlash |
| `prisma-postgres` | Prisma Postgres provisioning va management |
| `docker-expert` | Docker containerization, multi-stage builds, orchestration |
| `redis-development` | Redis data structures, performance, caching |
| `use-railway` | Railway deploy, services, databases, domains |

### Agent Skills (`.agents/skills/`)

| Skill | When to use |
|-------|-------------|
| `documentation-writer` | Texnik hujjatlar yozish |

### Skill Usage Rule

**Har bir task boshlanishida tegishli skillni aniqlash va faollashtirish shart:**

1. **NestJS module/service/controller** → `nestjs-best-practices`
2. **Prisma schema, migration** → `prisma-cli` + `prisma-database-setup`
3. **Prisma query yozish** → `prisma-client-api`
4. **TypeScript xatolik yoki murakkab tiplar** → `typescript-expert`
5. **Docker sozlash** → `docker-expert`
6. **Redis caching** → `redis-development`
7. **Deploy qilish** → `/deploy` yoki `use-railway`
8. **Test yozish** → `nestjs-best-practices` (testing patterns)

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | — |
| `JWT_SECRET` | Secret for JWT signing | — |
| `REDIS_HOST` | Redis host | `localhost` |
| `REDIS_PORT` | Redis port | `6379` |
| `PORT` | Server port | `4000` |
| `NODE_ENV` | Environment | `development` |
| `VAPID_PUBLIC_KEY` | Web Push VAPID public key | — |
| `VAPID_PRIVATE_KEY` | Web Push VAPID private key | — |
| `VAPID_EMAIL` | VAPID contact email | `mailto:admin@dafzentrum.uz` |
