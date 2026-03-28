# Role-Based Access Control (RBAC)

This document defines the permission model for the DaF ERP system. **Every restriction listed here must be enforced on both the backend (API) and frontend (UI).**

## Roles

| ID | Name | Scope |
|----|------|-------|
| 1 | **CEO** | All branches, full system access |
| 2 | **Branch Director** | Own branch only, full access within branch |
| 3 | **Administrator** | Operational access (CRUD for entities) |
| 4 | **Teacher** | Limited (TBD) |
| 5 | **Cashier** | Limited (TBD) |

A user can hold **multiple roles** simultaneously (many-to-many via `UserRole`).

## Core Principles

1. **CEO sees and does everything** — no restrictions, all branches
2. **Branch Director = CEO within their branch** — full access but scoped to their own branch and its staff
3. **Dual enforcement** — every role-restricted feature must be guarded on **both** backend (`@Roles` + `RolesGuard`) and frontend (conditional rendering via `useAuth`)
4. **Hide, don't disable** — if a user lacks permission, the UI element (button, tab, column, page) must be **hidden entirely**, not shown in a disabled state

## Permission Matrix

### Financial Data (Salary, Balance, Payments)

| Action | CEO | Branch Director | Administrator | Teacher | Cashier |
|--------|-----|-----------------|---------------|---------|---------|
| View salary (ish haqi) | All staff | Own branch staff + self | No | No | No |
| View balance | All staff | Own branch staff | No | No | No |

- **Frontend**: Check `user.roles.some(r => [1, 2].includes(r.id))` before rendering salary/balance UI
- **Backend**: Use `@Roles('CEO', 'Branch Director')` on salary endpoints

### Groups

| Action | CEO | Branch Director | Administrator | Teacher | Cashier |
|--------|-----|-----------------|---------------|---------|---------|
| View groups | Yes | Own branch | Yes | Own groups | No |
| Create group | Yes | Own branch | Yes | No | No |
| Update group | Yes | Own branch | Yes | No | No |
| Delete group | Yes | Own branch | Yes | No | No |

- **Frontend**: Check `user.roles.some(r => [1, 2, 3].includes(r.id))` for create/edit/delete buttons
- **Backend**: Use `@Roles('CEO', 'Branch Director', 'Administrator')` on mutation endpoints

### Teachers

| Action | CEO | Branch Director | Administrator | Teacher | Cashier |
|--------|-----|-----------------|---------------|---------|---------|
| View teachers | Yes | Own branch | Yes | No | No |
| Create teacher | Yes | Own branch | Yes | No | No |
| Update teacher | Yes | Own branch | Yes | No | No |
| Delete teacher | Yes | Own branch | Yes | No | No |

### Branch Director Scope Filtering

When a **Branch Director** accesses data, the backend must automatically filter results to only include data from their branch(es):

- Use `@CurrentUser('mainBranch')` or `@CurrentUser('branches')` to determine the user's branch scope
- Service methods should accept and enforce this scope in their `where` clauses
- The CEO always bypasses branch filtering

## Implementation Checklist (for new features)

When adding a role-restricted feature:

1. **Backend**: Add `@UseGuards(RolesGuard)` + `@Roles(...)` to the controller endpoint
2. **Backend**: If Branch Director has access, add branch-scope filtering in the service
3. **Frontend**: Use `useAuth` hook to check roles and conditionally render UI
4. **Frontend**: Use role IDs (not names) for checks: `user.roles.some(r => [1, 2].includes(r.id))`
5. **Docs**: Update this file's permission matrix

## Role ID Quick Reference

```
CEO = 1
Branch Director = 2
Administrator = 3
Teacher = 4
Cashier = 5
```

### Common frontend patterns

```tsx
// CEO + Branch Director only (e.g. salary)
const canSeeSalary = user?.roles.some((r) => [1, 2].includes(r.id)) ?? false;

// CEO + Branch Director + Administrator (e.g. group management)
const canManage = user?.roles.some((r) => [1, 2, 3].includes(r.id)) ?? false;
```
