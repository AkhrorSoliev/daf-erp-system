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
      "name": "Dilshod Rahimov",
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

## Stub Endpoints

The following modules have controllers registered but are not yet fully implemented:

| Endpoint | Status |
|----------|--------|
| `GET /students` | Stub |
| `GET /teachers` | Stub |
| `GET /groups` | Stub |
| `GET /courses` | Stub |
| `GET /rooms` | Stub |
| `GET /leads` | Stub |
| `GET /holidays` | Stub |
| `GET /employees` | Stub |

These will be implemented as the project progresses.
