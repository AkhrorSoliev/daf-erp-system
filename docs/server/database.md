# Database

Prisma ORM with PostgreSQL. All models, relationships, and schema details.

---

## Connection

- **Database:** PostgreSQL 16
- **ORM:** Prisma with `@prisma/adapter-pg`
- **Service:** `PrismaService` (global singleton)

Connection string format:

```
postgresql://USER:PASSWORD@HOST:PORT/DATABASE?schema=public
```

## Entity Relationship Diagram

```
Company (1)──────(N) User
Company (1)──────(N) Branch
Company (1)──────(N) Course

User (N)─────────(N) Role        (via UserRole)
User (N)─────────(N) Branch      (via UserBranch)
User (1:teacher)─(N) Group       (TeacherGroups)
User (N:student)─(N) Group       (StudentGroups)

Branch (1)───────(N) Room
Branch (1)───────(N) Group

Course (1)───────(N) Group

Student (N)──────(N) Group       (via Enrollment)
```

## Models

### Company

The top-level entity. Each company has branches, users, and courses.

| Field | Type | Notes |
|-------|------|-------|
| `id` | Int | Primary key (4-digit) |
| `name` | String | Company name |
| `subdomain` | String? | Custom subdomain |
| `logo` | String? | Logo URL |
| `phone` | String? | Contact phone |
| `activatedTill` | DateTime? | License expiration |
| `startOfWorkingDay` | String? | e.g. "09:00" |
| `endOfWorkingDay` | String? | e.g. "18:00" |
| `customCss` | String? | Custom CSS for dashboard |
| `customCssLead` | String? | Custom CSS for lead form |
| `leadSuccessText` | String? | Text shown after lead submission |

### User

All system users (CEO, admins, teachers, etc.) in a single table.

| Field | Type | Notes |
|-------|------|-------|
| `id` | Int | Primary key (4-digit) |
| `name` | String | Full name |
| `phone` | String? | 9-digit format |
| `photo` | String? | Avatar URL |
| `gender` | Gender? | MALE or FEMALE |
| `balance` | Int | Default: 0 |
| `login` | String? | Unique login (nullable for bot-registered users) |
| `password` | String? | bcrypt hash (nullable) |
| `isActive` | Boolean | Default: true |
| `companyId` | Int | FK to Company |
| `mainBranch` | Int? | Primary branch ID |

**Relations:** roles (many-to-many), branches (many-to-many), company, groups, teacherGroups

### Role

Predefined roles with fixed IDs.

| ID | Name |
|----|------|
| 1 | CEO |
| 2 | Branch Director |
| 3 | Administrator |
| 4 | Teacher |
| 5 | Cashier |

### UserRole (Join Table)

| Field | Type |
|-------|------|
| `userId` | Int (PK, FK) |
| `roleId` | Int (PK, FK) |

Cascade delete on both sides.

### UserBranch (Join Table)

| Field | Type |
|-------|------|
| `userId` | Int (PK, FK) |
| `branchId` | Int (PK, FK) |

Cascade delete on both sides.

### Branch

| Field | Type | Notes |
|-------|------|-------|
| `id` | Int | Primary key (4-digit) |
| `name` | String | Branch name |
| `address` | String? | Physical address |
| `phone` | String? | Contact phone |
| `isActive` | Boolean | Default: true |
| `companyId` | Int? | FK to Company |

### Room

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | Auto-generated |
| `name` | String | Room name/number |
| `capacity` | Int? | Max students |
| `branchId` | Int | FK to Branch |

### Course

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | Auto-generated |
| `name` | String | Course name (e.g. "A1 Deutsch") |
| `description` | String? | Course details |
| `price` | Int | Price in so'm |
| `duration` | Int? | Duration in hours |
| `isActive` | Boolean | Default: true |
| `companyId` | Int? | FK to Company |

### Group

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | Auto-generated |
| `name` | String | Group name |
| `courseId` | UUID | FK to Course |
| `teacherId` | Int | FK to User (teacher role) |
| `branchId` | Int | FK to Branch |
| `startDate` | DateTime? | Group start date |
| `isActive` | Boolean | Default: true |

**Relations:** course, teacher (User), branch, students (many-to-many via User), enrollments

### Student

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | Auto-generated |
| `firstName` | String | |
| `lastName` | String | |
| `phone` | String | 9-digit format |
| `extraPhone` | String? | Additional phone |
| `parentPhone` | String? | Parent contact |
| `parentName` | String? | Parent name |
| `telegram` | String? | Telegram username |
| `gender` | Gender? | MALE or FEMALE |
| `avatar` | String? | Photo URL |
| `placeOfStudy` | String? | School/university |
| `address` | String? | Home address |
| `passportSeries` | String? | ID document |
| `isActive` | Boolean | Default: true |

### Lead

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | Auto-generated |
| `firstName` | String | |
| `lastName` | String | |
| `phone` | String | |
| `gender` | Gender? | |
| `telegram` | String? | |
| `parentPhone` | String? | |
| `parentName` | String? | |
| `status` | String | Default: "new" |

### Enrollment (Join Table)

| Field | Type |
|-------|------|
| `id` | UUID |
| `studentId` | UUID (FK) |
| `groupId` | UUID (FK) |

Unique constraint on `(studentId, groupId)`.

### Holiday

| Field | Type |
|-------|------|
| `id` | UUID |
| `name` | String |
| `date` | DateTime |

## Enums

```prisma
enum Gender {
  MALE
  FEMALE
}
```
