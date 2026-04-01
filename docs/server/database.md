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
Company (1)──────(N) Comment

User (N)─────────(N) Role          (via UserRole)
User (N)─────────(N) Branch        (via UserBranch)
User (N:teacher)─(N) Group         (via GroupTeacher)
User (N:student)─(N) Group         (StudentGroups)
User (1)─────────(N) Comment       (author)
User (1)─────────(N) Notification
User (N)─────────(N) Comment       (via CommentAssignee)

Branch (1)───────(N) Room
Branch (1)───────(N) Group

Course (1)───────(N) Group

Group (1)────────(N) GroupTeacher
Room  (1)────────(N) Group

Student (N)──────(N) Group         (via Enrollment)
Student (1)──────(N) SmsMessage

Comment (1)──────(N) CommentAssignee
Comment (1)──────(N) Notification
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
| `id` | Int | Primary key (5-digit, starts from 10000) |
| `firstName` | String | First name |
| `lastName` | String | Last name |
| `phone` | String? | 9-digit format |
| `photo` | String? | Avatar URL |
| `gender` | Gender? | MALE or FEMALE |
| `balance` | Int | Default: 0 |
| `login` | String? | Unique login (nullable for bot-registered users) |
| `password` | String? | bcrypt hash (nullable) |
| `isActive` | Boolean | Default: true |
| `status` | UserStatus | Default: ACTIVE |
| `telegramChatId` | String? | Telegram bot chat ID |
| `companyId` | Int | FK to Company |
| `mainBranch` | Int? | Primary branch ID |

**Relations:** roles (many-to-many), branches (many-to-many), company, groups, groupTeachers (via GroupTeacher)

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
| `groupNumber` | Int? | Sequential number within level |
| `courseId` | UUID | FK to Course |
| `branchId` | Int | FK to Branch |
| `roomId` | UUID? | FK to Room |
| `companyId` | Int? | FK to Company |
| `days` | String? | Day pattern (e.g. "odd", "even") |
| `exactDays` | String[] | Exact day names (e.g. ["monday", "wednesday", "friday"]) |
| `lessonStartTime` | String? | e.g. "08:00" |
| `lessonEndTime` | String? | e.g. "09:30" |
| `status` | Int | Legacy status (default: 2) |
| `statusEnum` | GroupStatus | Default: FORMING |
| `comment` | String? | Group notes |
| `startDate` | DateTime? | Group start date |
| `endDate` | DateTime? | Group end date |
| `isActive` | Boolean | Default: true |

**Relations:** course, branch, room, company, teachers (many-to-many via GroupTeacher), students (many-to-many via User), enrollments

### GroupTeacher (Join Table)

| Field | Type |
|-------|------|
| `groupId` | UUID (PK, FK) |
| `teacherId` | Int (PK, FK) |

Cascade delete on both sides. Links teachers to groups (many-to-many).

### Student

| Field | Type | Notes |
|-------|------|-------|
| `id` | Int | Primary key (5-digit, starts from 10000) |
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

### Comment

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | Auto-generated |
| `entityType` | String | Polymorphic entity type (e.g. "Student", "Group") |
| `entityId` | String | Entity ID |
| `content` | String | Comment text |
| `isTask` | Boolean | Default: false — if true, this is a task |
| `isSystem` | Boolean | Default: false — system-generated comment |
| `dueDate` | DateTime? | Task due date |
| `priority` | TaskPriority? | Task priority (LOW, MEDIUM, HIGH, URGENT) |
| `authorId` | Int | FK to User |
| `companyId` | Int | FK to Company |

**Relations:** author (User), company, assignees (CommentAssignee), notifications

### CommentAssignee

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | Auto-generated |
| `commentId` | UUID | FK to Comment (cascade delete) |
| `userId` | Int | FK to User |
| `status` | AssigneeStatus | Default: PENDING |
| `seenAt` | DateTime? | When assignee saw the task |
| `doneAt` | DateTime? | When assignee marked done |
| `lastRemindedAt` | DateTime? | When last reminder was sent |

Unique constraint on `(commentId, userId)`.

### Notification

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | Auto-generated |
| `userId` | Int | FK to User |
| `type` | NotificationType | Notification type |
| `title` | String | Notification title |
| `message` | String | Notification body |
| `relatedEntityType` | String? | Related entity type |
| `relatedEntityId` | String? | Related entity ID |
| `commentId` | UUID? | FK to Comment (SetNull on delete) |
| `isRead` | Boolean | Default: false |
| `companyId` | Int | Company scope |

### PushSubscription

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | Auto-generated |
| `userId` | Int | FK to User (cascade delete) |
| `endpoint` | String | Unique push endpoint |
| `p256dh` | String | Push encryption key |
| `auth` | String | Push auth secret |

### SmsMessage

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | Auto-generated |
| `studentId` | Int | FK to Student |
| `content` | String | Message text |
| `type` | SmsMessageType | AUTO or MANUAL |
| `status` | SmsMessageStatus | SENT or FAILED |
| `senderUserId` | Int? | FK to User (sender) |
| `telegramMessageId` | Int? | Telegram message ID |
| `errorMessage` | String? | Error details if failed |
| `companyId` | Int? | Company scope |

## Enums

```prisma
enum Gender {
  MALE
  FEMALE
}

enum UserStatus {
  ACTIVE
  INACTIVE
  SUSPENDED
  TERMINATED
  ARCHIVED
}

enum StudentStatus {
  ACTIVE
  INACTIVE
  GRADUATED
  EXPELLED
  ARCHIVED
}

enum GroupStatus {
  FORMING
  ACTIVE
  PAUSED
  COMPLETED
  CANCELLED
  ARCHIVED
}

enum CourseStatus {
  ACTIVE
  INACTIVE
  DEPRECATED
  ARCHIVED
}

enum BranchStatus {
  ACTIVE
  INACTIVE
  CLOSED
  ARCHIVED
}

enum RoomStatus {
  ACTIVE
  INACTIVE
  UNDER_MAINTENANCE
  ARCHIVED
}

enum LeadStatus {
  NEW
  CONTACTED
  TRIAL
  CONVERTED
  LOST
  ARCHIVED
}

enum EnrollmentStatus {
  ACTIVE
  FROZEN
  COMPLETED
  DROPPED
  TRANSFERRED
}

enum AssigneeStatus {
  PENDING
  SEEN
  DONE
}

enum NotificationType {
  COMMENT
  TASK_ASSIGNED
  TASK_STATUS_CHANGED
  TASK_DELETED
  TASK_UPDATED
  TASK_REMINDER
  SYSTEM
}

enum TaskPriority {
  LOW
  MEDIUM
  HIGH
  URGENT
}

enum SmsMessageType {
  AUTO
  MANUAL
}

enum SmsMessageStatus {
  SENT
  FAILED
}

enum EntityAction {
  CREATE
  UPDATE
  DELETE
  STATUS_CHANGE
  RESTORE
}
```
