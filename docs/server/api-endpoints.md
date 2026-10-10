# API Endpoints

Complete REST API reference. Base URL: `http://localhost:4000/api`

---

## Authentication

All endpoints require JWT authentication unless marked as **Public**.

The `Authorization` header must contain a valid Bearer token:

```
Authorization: Bearer eyJhbGciOi...
```

---

## Auth

### POST /auth/login `Public`

Authenticate with login and password.

**Body:**

| Field | Type | Required |
|-------|------|----------|
| `login` | string | Yes |
| `password` | string | Yes |

**Response:** `200`

```json
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "user": { ... }
}
```

**Errors:** `401` — Invalid credentials or inactive user.

---

### POST /auth/refresh `Public`

Get a new token pair using a refresh token.

**Body:**

| Field | Type | Required |
|-------|------|----------|
| `refreshToken` | string | Yes |

**Response:** `200` — Same shape as login.

**Errors:** `401` — Invalid, expired, or wrong token type.

---

## Users

### GET /users

List users with filtering and pagination.

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `user_type` | string | — | Filter by role name (e.g. `Teacher`, `CEO`) |
| `branch_id` | number | — | Filter by branch |
| `company_id` | number | — | Filter by company |
| `page` | number | 1 | Page number |
| `per_page` | number | 10 | Items per page |

**Example:** `GET /users?user_type=Teacher&branch_id=1001&per_page=20`

**Response:** `200`

```json
{
  "data": [
    {
      "id": 1003,
      "firstName": "Dilshod",
      "lastName": "Rahimov",
      "phone": "901234569",
      "photo": null,
      "gender": null,
      "balance": 0,
      "companyId": 1001,
      "mainBranch": 1002,
      "isActive": true,
      "roles": [{ "id": 4, "name": "Teacher" }],
      "branches": [{ "id": 1002, "name": "Namangan" }],
      "company": { "id": 1001, "name": "DaF Sprachzentrum", ... }
    }
  ],
  "total": 1,
  "page": 1,
  "per_page": 10
}
```

---

### GET /users/:id

Get a single user by ID.

**Response:** `200` — User object (same shape as items in the list).

**Errors:** `404` — User not found.

---

## Branches

### GET /branches

List branches, optionally filtered by company.

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `company_id` | number | — | Filter by company |

**Example:** `GET /branches?company_id=1001`

**Response:** `200`

```json
[
  { "id": 1001, "name": "Farg'ona", "address": null, "phone": null, "isActive": true, "companyId": 1001 },
  { "id": 1002, "name": "Namangan", ... },
  { "id": 1003, "name": "Qarshi", ... }
]
```

---

### GET /branches/:id

Get a single branch by ID.

**Response:** `200` — Branch object.

**Errors:** `404` — Branch not found.

---

## Company

### GET /company

List companies with pagination.

**Query Parameters:** `page`, `pageSize`

**Response:** `200`

```json
{
  "data": [{ "id": 1001, "name": "DaF Sprachzentrum", ... }],
  "total": 1,
  "page": 1,
  "pageSize": 10
}
```

---

### GET /company/:id

Get a single company with its branches and courses.

**Response:** `200`

```json
{
  "id": 1001,
  "name": "DaF Sprachzentrum",
  "subdomain": null,
  "logo": null,
  "phone": null,
  "activatedTill": null,
  "startOfWorkingDay": null,
  "endOfWorkingDay": null,
  "branches": [...],
  "courses": [...]
}
```

---

### PATCH /company/:id `Roles: CEO, Administrator`

Update company settings.

**Body:** (all fields optional)

| Field | Type |
|-------|------|
| `name` | string |
| `subdomain` | string |
| `logo` | string |
| `phone` | string |
| `activatedTill` | string (ISO date) |
| `startOfWorkingDay` | string |
| `endOfWorkingDay` | string |
| `customCss` | string |
| `customCssLead` | string |
| `leadSuccessText` | string |

**Response:** `200` — Updated company object.

**Errors:** `403` — Insufficient role.

---

## Groups

### GET /groups

List groups with filtering and pagination.

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `branch_id` | number | — | Filter by branch |
| `status` | string | — | Filter by status enum |
| `page` | number | 1 | Page number |
| `pageSize` | number | 10 | Items per page |

---

### GET /groups/:id

Get a single group with course, branch, room, and teachers.

---

### POST /groups `Roles: CEO, BD, Administrator`

Create a new group.

---

### PATCH /groups/:id `Roles: CEO, BD, Administrator`

Update a group.

---

### DELETE /groups/:id `Roles: CEO, BD, Administrator`

Soft delete (archive) a group.

---

### GET /groups/schedule-conflicts

Check for teacher/room scheduling conflicts.

**Query Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `branchId` | number | Yes | Branch ID |
| `exactDays` | string | Yes | Comma-separated day names (e.g. "monday,wednesday,friday") |
| `startTime` | string | Yes | e.g. "08:00" |
| `endTime` | string | Yes | e.g. "09:30" |
| `roomId` | string | No | Check conflicts for this room |
| `teacherId` | number | No | Check conflicts for this teacher |
| `excludeGroupId` | string | No | Exclude this group from conflict check |

**Response:** `200` — Array of conflicting group objects.

---

### GET /groups/available-rooms

Get rooms available for a time slot.

**Query Parameters:** `branchId`, `exactDays`, `startTime`, `endTime`, `excludeGroupId?`

**Response:** `200` — Array of available rooms.

---

### GET /groups/available-teachers

Get teachers available for a time slot.

**Query Parameters:** `branchId`, `exactDays`, `startTime`, `endTime`, `excludeGroupId?`

**Response:** `200` — Array of available teachers.

---

### GET /groups/available-slots

Get available time slots for a room.

**Query Parameters:** `branchId`, `roomId`, `exactDays`, `excludeGroupId?`

**Response:** `200` — Array of available time slot objects.

---

### GET /groups/next-name

Get the next auto-generated group name for a level.

**Query Parameters:** `level` (e.g. "A1"), `branchId`

**Response:** `200` — `{ name: "A1-005" }`

---

### GET /groups/:id/students

Get all students enrolled in a group.

---

### PATCH /groups/:id/status `Roles: CEO, BD, Administrator`

Change group status.

---

### GET /groups/:id/status-history `Roles: CEO, BD, Administrator`

Get group status change history.

---

## Comments

A comment is plain text on an entity. Tasks are not comments any more: see **Tasks** below (ADR-0074).

### POST /comments `Roles: CEO, BD, Administrator`

Create a comment.

**Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `entityType` | string | Yes | One of `COMMENTABLE_ENTITY_TYPES`, e.g. "Student", "Group" |
| `entityId` | string | Yes | Entity ID |
| `content` | string | Yes | Comment text |

Any other field (`isTask`, `assigneeIds`, `dueDate`, `priority`) is rejected with 400.

---

### GET /comments `Roles: CEO, BD, Administrator`

List comments for an entity (rows that were once tasks, `isTask = true`, are not returned).

**Query Parameters:** `entityType`, `entityId`, `page`, `pageSize`

---

### GET /comments/latest `Roles: CEO, BD, Administrator`

Get the latest comment for an entity.

**Query Parameters:** `entityType`, `entityId`

---

### PATCH /comments/:id `Roles: CEO, BD, Administrator`

Edit a comment's `content`; the author or the CEO only.

---

### DELETE /comments/:id `Roles: CEO`

Delete a comment.

---

## Tasks

All routes are `@Roles(...STAFF_ROLES)`; `TaskPolicy` (`server/src/tasks/task-policy.ts`) narrows who may see or do what. Ids are UUIDs.

### GET /tasks

List tasks, newest first, cursor-paged (`{ data, nextCursor }`).

**Query Parameters:** `view` (`my` assigned to me, `created` written by me, `all` everything the caller may see), `status[]`, `assigneeId[]`, `authorId[]`, `branchId[]`, `priority[]`, `due` (`overdue`, `today`, `week`), `q`, `entityType` + `entityId`, `closedDays` (window for DONE / CANCELLED, default 14), `cursor`, `limit` (1–100, default 50)

---

### GET /tasks/counts

Counts for the sidebar and tab badges (`my`, `myOverdue`, `created`, `review`).

### GET /tasks/workload

Per-person workload for a month; managers only (CEO, BD — others get 403). **Query Parameters:** `month` (`YYYY-MM`), `branchId`

### GET /tasks/assignable

People the caller may assign or add as watchers. **Query Parameters:** `entityType`, `entityId`

---

### POST /tasks

Create a task (one `Task` per assignee when `separateCopies` is true, all sharing a `batchId`).

**Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | Yes | 1–200 characters |
| `assigneeIds` | number[] | Yes | At least one; must be on the caller's ladder |
| `watcherIds` | number[] | No | Watchers |
| `description` | string | No | Up to 5000 characters |
| `dueAt` | string | No | ISO instant, or `YYYY-MM-DD` (18:00 Tashkent); 08:00–22:00, never Sunday or a holiday |
| `priority` | string | No | LOW, MEDIUM (default), HIGH, URGENT |
| `entityType`, `entityId` | string | No | Both or neither |
| `separateCopies` | boolean | No | A separate task for each assignee |
| `steps` | `{ title }[]` | No | Checklist |

---

### GET /tasks/:id

The drawer payload: the task, its events (discussion and history), the caller's access and the batch.

### PATCH /tasks/:id

Edit `title`, `description`, `priority` or `dueAt` (`null` clears it); the author or a manager, manual open tasks only.

### POST /tasks/:id/status

Move the caller's own task: `{ status: NEW | IN_PROGRESS | IN_REVIEW | DONE }`. Managers who are not assignees use review or cancel instead.

### POST /tasks/:id/review

Author or manager: `{ action: ACCEPT | RETURN, reason? }`. RETURN needs a reason.

### POST /tasks/:id/cancel

Author or manager: `{ reason? }`.

### POST /tasks/:id/duplicate

Copy a task (the way to reopen a closed one).

### PUT /tasks/:id/participants

Replace the assignees and watchers: `{ assigneeIds, watcherIds? }`.

### POST /tasks/:id/seen

Mark the caller as having opened the task.

### POST /tasks/:id/steps · PATCH /tasks/:id/steps/:stepId · DELETE /tasks/:id/steps/:stepId

Add a step (`{ title }`), tick or rename it (`{ done?, title? }`), remove it.

### POST /tasks/:id/events

Add a comment to the discussion: `{ text }`.

---

## Notifications

Every route here except `vapid-public-key` (public) is keyed on the caller (own rows and own devices only, no branch question). A row waits for the user when `actionRequired` is true and `resolvedAt` is null; it closes itself when its job is done (ADR-0076).

### GET /notifications

List current user's notifications, newest first, with keyset paging.

**Query Parameters:**

| Name | Values | Notes |
|------|--------|-------|
| `filter` | `pending` \| `all` | `pending` = rows that wait (`actionRequired` and not resolved), read or not. Default `all`. |
| `type` | `task` \| `attendance` \| `payment` \| `system` | The bell's four groups. |
| `q` | text, up to 100 chars | Case-insensitive search in the title and the message. |
| `cursor` | string | The previous response's `nextCursor`; an invalid one is 400. |
| `pageSize` | 1–50 | Default 20. |
| `page` | integer | Deprecated and ignored (the bell before phase 5 still sends it). |

**Response:** `{ data: Notification[], nextCursor: string | null }`. Each row carries the Notification fields plus `group` (`task` \| `attendance` \| `payment` \| `system`), `actionRequired`, `resolvedAt` and `groupKey`.

---

### GET /notifications/unread-count

The bell's badge: the number of rows that wait for the user and are unread (`actionRequired` and `resolvedAt` null and not read). Reading a row removes it from the badge; only the job being done closes it.

**Response:** `{ count: number }`

---

### GET /notifications/counts

The «Barcha bildirishnomalar» page's left list.

**Response:** `{ pending: number, all: number, groups: { task, attendance, payment, system } }` — `pending` is the number of rows that wait (read or not), `all` and `groups` count every row.

---

### PATCH /notifications/:id/read

Mark a notification as read.

---

### PATCH /notifications/read-all

Mark all notifications as read.

---

### GET /notifications/stream

SSE (Server-Sent Events) stream for real-time notifications. Requires JWT via Authorization header. Messages (`data: {json}`): `{ type: 'notification', notification }` (a new row, with `group`), `{ type: 'notification.resolved', ids, resolvedAt }` (the rows whose job got done), `{ type: 'task.updated', taskId }`.

---

### POST /notifications/push/subscribe

Subscribe to web push notifications.

**Body:** `{ endpoint, p256dh, auth }`

---

### DELETE /notifications/push/unsubscribe

Unsubscribe from web push.

---

### POST /notifications/devices

Native app: register the caller's Expo push token (an existing token moves to the caller).

**Body:** `{ token, platform?, appVersion? }` — `token` 8–255 chars, `platform` `ios` \| `android`, `appVersion` up to 32 chars.

---

### DELETE /notifications/devices

Native app: unregister the caller's Expo push token.

**Body:** `{ token }`

---

### GET /notifications/vapid-public-key

Get the VAPID public key for push subscription. Public: no JWT, not keyed on the caller.

**Response:** `{ key: string }`

---

## Other Endpoints

The following modules have full CRUD implemented:

| Module | Base Endpoint | Notes |
|--------|--------------|-------|
| Students | `/students` | Full CRUD + search + filters |
| Teachers | `/teachers` | Full CRUD + studentCount |
| Courses | `/courses` | Full CRUD |
| Rooms | `/rooms` | Full CRUD |
| Leads | `/leads` | Full CRUD + status management |
| Holidays | `/holidays` | Full CRUD |
| Employees | `/employees` | User management (CEO only) |
| Archive | `/archive` | Soft-deleted entity management (CEO only) |
| Entity History | `/entity-history` | Audit log queries |
| SMS | `/sms` | SMS/Telegram message sending |
