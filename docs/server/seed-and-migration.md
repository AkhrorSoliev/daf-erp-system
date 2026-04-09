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
| `20260401120000_split_user_name_to_firstname_lastname` | Split User.name into firstName + lastName |
| `20260401140000_add_task_duedate_priority_reminder` | Added dueDate, priority to Comment; lastRemindedAt to CommentAssignee |

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

| Login | Name | Role | Branch |
|-------|------|------|--------|
| `ceo` | CEO Admin | CEO | Farg'ona |

Additionally, 10 teachers are created with individual logins (e.g. `jamsher_murtazoxonov`, password: `teacher123`), 6 rooms, 2 courses (Standart + Intensiv), and ~45 groups with full schedule data (days, time slots, room/teacher assignments).

### Seed Behavior

The seed script **clears the entire database** before re-creating data. It deletes all rows from every table and re-creates from scratch. Running it multiple times is safe but all existing data will be lost.

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
