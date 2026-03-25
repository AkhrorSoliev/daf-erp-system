# Server Authentication

JWT-based authentication with access and refresh tokens.

---

## Overview

| Token | Duration | Purpose |
|-------|----------|---------|
| **Access Token** | 1 hour | Sent with every API request |
| **Refresh Token** | 24 hours | Used to obtain new access + refresh tokens |

## Login Flow

```
Client                          Server
  │                               │
  │  POST /api/auth/login         │
  │  { login, password }          │
  │──────────────────────────────>│
  │                               │  1. LocalStrategy validates credentials
  │                               │  2. bcrypt compares password hash
  │                               │  3. Generates access + refresh tokens
  │  { accessToken,               │
  │    refreshToken,              │
  │    user }                     │
  │<──────────────────────────────│
```

## Refresh Flow

```
Client                          Server
  │                               │
  │  POST /api/auth/refresh       │
  │  { refreshToken }             │
  │──────────────────────────────>│
  │                               │  1. Verify refresh token
  │                               │  2. Check token type === 'refresh'
  │                               │  3. Load user from DB
  │                               │  4. Generate new token pair
  │  { accessToken,               │
  │    refreshToken,              │
  │    user }                     │
  │<──────────────────────────────│
```

## JWT Payload

**Access Token:**

```json
{
  "sub": 1001,
  "roles": ["CEO"]
}
```

**Refresh Token:**

```json
{
  "sub": 1001,
  "type": "refresh"
}
```

## Endpoints

### POST /api/auth/login

Public (no auth required).

**Request:**

```json
{
  "login": "ceo",
  "password": "123456"
}
```

**Response:**

```json
{
  "accessToken": "eyJhbGciOi...",
  "refreshToken": "eyJhbGciOi...",
  "user": {
    "id": 1001,
    "name": "Abdulloh Karimov",
    "phone": "901234567",
    "photo": null,
    "gender": null,
    "balance": 0,
    "companyId": 1001,
    "mainBranch": 1001,
    "roles": [{ "id": 1, "name": "CEO" }],
    "branches": [
      { "id": 1001, "name": "Farg'ona" },
      { "id": 1002, "name": "Namangan" },
      { "id": 1003, "name": "Qarshi" }
    ],
    "company": {
      "id": 1001,
      "name": "DaF Sprachzentrum",
      "subdomain": null,
      "logo": null,
      "phone": null
    }
  }
}
```

### POST /api/auth/refresh

Public (no auth required).

**Request:**

```json
{
  "refreshToken": "eyJhbGciOi..."
}
```

**Response:** Same shape as login response.

## Guards & Decorators

### JwtAuthGuard (Global)

Applied to every route by default. Extracts the Bearer token from the `Authorization` header and validates it.

### @Public()

Bypasses JWT auth for specific routes:

```typescript
@Public()
@Post('login')
async login() { ... }
```

### @Roles(...roles)

Restricts access to specific roles:

```typescript
@Roles('CEO', 'Administrator')
@Patch(':id')
async update() { ... }
```

### @CurrentUser(field?)

Injects the authenticated user into the handler:

```typescript
@Get('me')
getMe(@CurrentUser() user) {
  return user; // { id, roles }
}

@Get('my-id')
getMyId(@CurrentUser('id') userId: number) {
  return userId; // 1001
}
```

## Roles

| ID | Name |
|----|------|
| 1 | CEO |
| 2 | Branch Director |
| 3 | Administrator |
| 4 | Teacher |
| 5 | Cashier |

## Password Hashing

Passwords are hashed with **bcryptjs** (10 salt rounds):

```typescript
const hashed = await bcrypt.hash('123456', 10);
const isValid = await bcrypt.compare('123456', hashed);
```

Passwords are **never** returned in API responses — all queries use `select` to exclude the `password` field.
