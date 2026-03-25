# Seed & Migrations

Managing database schema changes and initial data.

---

## Migrations

Prisma handles database migrations automatically from the schema file.

### Create a New Migration

After modifying `prisma/schema.prisma`:

```bash
cd server
npx prisma migrate dev --name <migration-name>
```

This will:
1. Generate a SQL migration file in `prisma/migrations/`
2. Apply the migration to the local database
3. Regenerate the Prisma Client

### Apply Migrations (Production)

```bash
npx prisma migrate deploy
# or
npm run db:migrate:deploy
```

### Migration History

| Migration | Description |
|-----------|-------------|
| `20260324024129_init` | Initial schema (User, Branch, Room, Course, Student, Group, etc.) |
| `20260325022714_add_company_fields` | Added Company model with subdomain, logo, phone |
| `20260325103551_change_branch_id_to_int` | Changed Branch ID from UUID to Int (4-digit) |
| `20260325105102_redesign_user_model_with_roles` | New User model with Role, UserRole, UserBranch tables |

### Prisma Studio

Open a visual database browser:

```bash
npx prisma studio
```

Opens at `http://localhost:5555`

---

## Seed Data

**File:** `prisma/seed.ts`

### Run Seed

```bash
npm run db:seed
```

### What Gets Created

**1. Company**

| ID | Name |
|----|------|
| 1001 | DaF Sprachzentrum |

**2. Branches**

| ID | Name | Company |
|----|------|---------|
| 1001 | Farg'ona | 1001 |
| 1002 | Namangan | 1001 |
| 1003 | Qarshi | 1001 |

**3. Roles**

| ID | Name |
|----|------|
| 1 | CEO |
| 2 | Branch Director |
| 3 | Administrator |
| 4 | Teacher |
| 5 | Cashier |

**4. Users**

All users have password: `123456`

| ID | Login | Name | Role | Branches |
|----|-------|------|------|----------|
| 1001 | `ceo` | Abdulloh Karimov | CEO | All 3 branches |
| 1002 | `admin` | Sardor Aliyev | Administrator | Farg'ona |
| 1003 | `teacher` | Dilshod Rahimov | Teacher | Namangan |

### Idempotent Seed

The seed script uses `upsert` for companies, branches, and roles — so running it multiple times is safe. Users are created only if they don't already exist (checked by ID).

---

## Useful Commands

| Command | Description |
|---------|-------------|
| `npx prisma migrate dev` | Create + apply migration |
| `npx prisma migrate dev --name <name>` | Named migration |
| `npx prisma migrate deploy` | Apply pending migrations |
| `npx prisma migrate reset` | Drop DB + re-apply all migrations + seed |
| `npx prisma db push` | Push schema without migration file |
| `npx prisma generate` | Regenerate Prisma Client |
| `npx prisma studio` | Open DB browser GUI |
| `npm run db:seed` | Run seed script |
