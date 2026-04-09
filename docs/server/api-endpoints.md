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

## Comments & Tasks

### POST /comments `Roles: CEO, BD, Administrator`

Create a comment or task.

**Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `entityType` | string | Yes | e.g. "Student", "Group" |
| `entityId` | string | Yes | Entity ID |
| `content` | string | Yes | Comment text |
| `isTask` | boolean | No | If true, creates a task (CEO/BD only) |
| `assigneeIds` | number[] | No | User IDs to assign (tasks only) |
| `dueDate` | string (ISO) | No | Task due date |
| `priority` | string | No | LOW, MEDIUM, HIGH, or URGENT |

---

### GET /comments `Roles: CEO, BD, Administrator`

List comments for an entity.

**Query Parameters:** `entityType`, `entityId`, `page`, `pageSize`

---

### GET /comments/latest `Roles: CEO, BD, Administrator`

Get the latest comment for an entity.

**Query Parameters:** `entityType`, `entityId`

---

### GET /comments/my-tasks

Get tasks assigned to the current user.

**Query Parameters:** `page`, `pageSize`, `status?` (PENDING, SEEN, DONE)

---

### GET /comments/created-tasks `Roles: CEO, BD`

Get tasks created by the current user.

**Query Parameters:** `page`, `pageSize`

---

### PATCH /comments/:id `Roles: CEO, BD, Administrator`

Update a comment/task (content, dueDate, priority).

---

### DELETE /comments/:id `Roles: CEO`

Delete a comment.

---

### PATCH /comments/:id/assignee-status

Update assignee status on a task.

**Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `status` | string | Yes | SEEN or DONE |

---

## Notifications

### GET /notifications

List current user's notifications with pagination.

**Query Parameters:** `page`, `pageSize`

---

### GET /notifications/unread-count

Get unread notification count for the current user.

---

### PATCH /notifications/:id/read

Mark a notification as read.

---

### PATCH /notifications/read-all

Mark all notifications as read.

---

### GET /notifications/stream

SSE (Server-Sent Events) stream for real-time notifications. Requires JWT via Authorization header.

---

### POST /notifications/push/subscribe

Subscribe to web push notifications.

**Body:** `{ endpoint, keys: { p256dh, auth } }`

---

### DELETE /notifications/push/unsubscribe

Unsubscribe from web push.

---

### GET /notifications/vapid-public-key

Get the VAPID public key for push subscription.

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
