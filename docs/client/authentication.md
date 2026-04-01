# Client Authentication

Login flow, token management, auto-refresh, and route protection.

---

## Overview

1. User logs in with `login` + `password`
2. Backend returns `accessToken` (1h) + `refreshToken` (24h) + `user` data
3. Tokens and user stored in cookies via `js-cookie`
4. Axios interceptor auto-attaches token to every request
5. On 401, interceptor auto-refreshes using the refresh token
6. Middleware redirects unauthenticated users to `/login`

## Login Flow

```
User submits form
       │
       ▼
POST /api/auth/login
       │
       ▼
Store in cookies:
  - token (1h expiry)
  - refreshToken (24h expiry)
  - user (24h expiry)
       │
       ▼
Update Zustand store
       │
       ▼
Redirect to /
```

## Auth Store (Zustand)

**File:** `hooks/use-auth.ts`

```typescript
interface AuthState {
  user: AuthUser | null;
  token: string | null;
  setAuth: (user, accessToken, refreshToken) => void;
  logout: () => void;
  hydrate: () => void;
}
```

### setAuth(user, accessToken, refreshToken)

Called after successful login. Stores tokens in cookies and updates state.

Cookie expiration:
- `token` — 1 hour (matches access token)
- `refreshToken` — 1 day (matches refresh token)
- `user` — 1 day

### logout()

Removes all cookies, clears state, redirects to `/login`.

### hydrate()

Called on app mount (via `AuthProvider`). Reads cookies and restores state. If cookies are corrupted, cleans up automatically.

## User Interface

```typescript
interface AuthUser {
  id: number;
  firstName: string;
  lastName: string;
  phone: string | null;
  photo: string | null;
  gender: string | null;
  balance: number;
  companyId: number;
  mainBranch: number | null;
  roles: { id: number; name: string }[];
  branches: { id: number; name: string }[];
  company: {
    id: number;
    name: string;
    subdomain: string | null;
    logo: string | null;
    phone: string | null;
  };
}
```

> **Note:** User names are split into `firstName` and `lastName`. Display as `${user.firstName} ${user.lastName}`.

## API Client (Axios)

**File:** `lib/api.ts`

### Request Interceptor

Automatically adds the JWT token to every request:

```
Authorization: Bearer <accessToken>
```

### Response Interceptor — Auto Refresh

When a request returns `401`:

1. Check if `refreshToken` exists in cookies
2. If no refresh token — clear cookies, redirect to `/login`
3. If refreshing is already in progress — queue the failed request
4. Call `POST /api/auth/refresh` with the refresh token
5. On success — update cookies, retry all queued requests with the new token
6. On failure — clear cookies, redirect to `/login`

**Queue mechanism:** If multiple requests fail with 401 simultaneously, only one refresh call is made. All other requests wait in a queue and are retried with the new token.

## Middleware (Route Protection)

**File:** `middleware.ts`

Runs on every navigation (server-side, before page renders).

| Condition | Action |
|-----------|--------|
| On `/login` with valid token or refresh token | Redirect to `/` |
| On any other page without any token | Redirect to `/login` |
| Otherwise | Allow navigation |

**Matcher:** All routes except `_next/static`, `_next/image`, `favicon.ico`, `sitemap.xml`, `robots.txt`.

## AuthProvider

**File:** `components/providers/auth-provider.tsx`

Wraps the app and calls `hydrate()` on mount to restore auth state from cookies. Placed in the root `layout.tsx`.

## Portal System

The login page adapts to the current subdomain. Portal type is detected from the hostname on the server and passed to client components.

**Config:** `lib/portal.ts`

| Portal | Domain | Allowed Roles | UI |
|--------|--------|---------------|----|
| Admin | `admin.dafzentrum.uz` | CEO (1), BD (2), Admin (3), Cashier (5) | Default branding |
| Teacher | `lehrer.dafzentrum.uz` | Teacher (4) | Teacher branding + icon |
| Student | `student.dafzentrum.uz` | — (not yet) | Student branding + icon |

### Portal-Role Enforcement (Two Layers)

1. **Backend (primary):** Login endpoint checks `Origin` header → returns `403` if role doesn't match portal
2. **Middleware (secondary):** `middleware.ts` checks cookies for authenticated users → clears session and redirects to `/login` if role doesn't match portal

Localhost has no restriction — all roles can log in from any portal.

## Login Form

**File:** `app/(auth)/login/login-form.tsx`

- Fields: `login` (text), `password` (with visibility toggle)
- Submits to `POST /api/auth/login` via the API client
- On success: calls `setAuth()` and redirects to `/`
- On 403 error: shows portal-specific message ("Sizning rolingiz bu portalga kirish huquqiga ega emas")
- On other errors: shows "Login yoki parol noto'g'ri" message
- Loading state disables the submit button
