# Server Architecture

NestJS backend structure, modules, and coding conventions.

---

## Project Structure

```
server/
├── src/
│   ├── main.ts                 # App bootstrap
│   ├── app.module.ts           # Root module (imports all feature modules)
│   │
│   ├── auth/                   # Authentication (JWT + Passport)
│   ├── users/                  # User management
│   ├── branches/               # Branch (filial) management
│   ├── company/                # Company settings
│   ├── courses/                # Course management
│   ├── groups/                 # Group management
│   ├── students/               # Student management
│   ├── teachers/               # Teacher management (stub)
│   ├── employees/              # Employee management (stub)
│   ├── leads/                  # Lead tracking (stub)
│   ├── rooms/                  # Room management (stub)
│   ├── holidays/               # Holiday management (stub)
│   │
│   ├── common/                 # Shared utilities
│   │   ├── decorators/         # @Public(), @Roles(), @CurrentUser()
│   │   ├── guards/             # JwtAuthGuard, RolesGuard
│   │   ├── dto/                # PaginationDto
│   │   ├── filters/            # Exception filters
│   │   ├── pipes/              # Custom pipes
│   │   └── interceptors/       # Request/response transforms
│   │
│   ├── prisma/                 # Database service (global)
│   └── redis/                  # Cache service (global)
│
├── prisma/
│   ├── schema.prisma           # Database schema
│   ├── seed.ts                 # Seed script
│   └── migrations/             # Migration history
│
└── package.json
```

## Module Pattern

Every feature follows the same structure:

```
<feature>/
├── <feature>.module.ts         # Module definition
├── <feature>.controller.ts     # HTTP routes (thin layer)
├── <feature>.service.ts        # Business logic
└── dto/                        # Request/response DTOs
    ├── create-<feature>.dto.ts
    ├── update-<feature>.dto.ts
    └── <feature>-query.dto.ts
```

**Rules:**
- Controllers are thin — validate input and delegate to services
- Services contain all business logic
- `PrismaService` is used for all DB access (no raw SQL)
- `PrismaModule` is global — no need to import per module

## Naming Conventions

| What | Convention | Example |
|------|-----------|---------|
| Files | kebab-case | `create-student.dto.ts` |
| Classes | PascalCase | `CreateStudentDto` |
| DB fields | camelCase | `firstName`, `companyId` |
| API routes | kebab-case plural | `/api/branches`, `/api/students` |

## Global Configuration

### API Prefix

All routes are prefixed with `/api`:

```typescript
app.setGlobalPrefix('api');
```

### Validation

Global `ValidationPipe` applied in `main.ts`:

```typescript
app.useGlobalPipes(new ValidationPipe({
  whitelist: true,            // Strip unknown properties
  forbidNonWhitelisted: true, // Throw on unknown properties
  transform: true,            // Auto-transform types
}));
```

### CORS

Enabled for the frontend origin:

```typescript
app.enableCors({
  origin: 'http://localhost:3000',
  credentials: true,
});
```

### Port

Default: `4000` (configurable via `PORT` env variable)

## Global Providers

Registered in `AppModule`:

| Provider | Purpose |
|----------|---------|
| `JwtAuthGuard` | Applied to all routes by default |
| `RolesGuard` | Checks role requirements when `@Roles()` is used |

## Error Handling

Use NestJS built-in exceptions:

```typescript
throw new NotFoundException(`User #${id} not found`);
throw new BadRequestException('Invalid input');
throw new ForbiddenException('Access denied');
throw new UnauthorizedException('Invalid token');
```

Never expose internal error details to clients.

## File Size Guidelines

- **Target:** 100–300 lines per file
- **Maximum:** 500 lines
- If a file exceeds 500 lines, split it into smaller focused parts
