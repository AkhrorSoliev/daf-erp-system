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

### Authentication & Authorization

- All routes require JWT auth by default (global `JwtAuthGuard`)
- Public routes use `@Public()` decorator to bypass auth
- Role-based access uses `@Roles('CEO', 'Administrator')` decorator with `RolesGuard` (string-based role names)
- JWT uses **access token (1h)** + **refresh token (24h)** pair
- `POST /api/auth/login` returns both tokens + user data
- `POST /api/auth/refresh` refreshes the token pair
- Use `@CurrentUser()` decorator to get the authenticated user in controllers

### Role-Based Access Control (RBAC) — Backend Rules

> See full permission matrix: `docs/role-access.md`

**Every role-based restriction must be enforced on BOTH backend AND frontend.** Backend rejects unauthorized API calls; frontend hides/disables UI.

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
- **Branch Director scope** — when a Branch Director makes a request, service-level logic must filter data to **only their branch** (using `@CurrentUser('branches')` or `@CurrentUser('mainBranch')`)
- When adding a new role-restricted feature: always add the restriction in both the controller (backend) and the component (frontend)

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

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | — |
| `JWT_SECRET` | Secret for JWT signing | — |
| `REDIS_HOST` | Redis host | `localhost` |
| `REDIS_PORT` | Redis port | `6379` |
| `PORT` | Server port | `4000` |
| `NODE_ENV` | Environment | `development` |
