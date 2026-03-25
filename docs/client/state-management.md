# State Management

Client state with Zustand, server state with TanStack React Query.

---

## Architecture

| Type | Library | Purpose |
|------|---------|---------|
| **Client State** | Zustand | UI state, auth, user preferences |
| **Server State** | TanStack React Query | API data fetching, caching, mutations |

## Zustand Stores

### useAuth

**File:** `hooks/use-auth.ts`

Manages authentication state.

```typescript
const { user, token, setAuth, logout, hydrate } = useAuth();
```

| Property | Type | Description |
|----------|------|-------------|
| `user` | `AuthUser \| null` | Current logged-in user |
| `token` | `string \| null` | Current access token |
| `setAuth()` | function | Store user + tokens (login) |
| `logout()` | function | Clear everything + redirect |
| `hydrate()` | function | Restore state from cookies |

See [Authentication](authentication.md) for details.

### useBranchSwitcher

**File:** `hooks/use-branch-switcher.ts`

Manages the active branch selection.

```typescript
const { activeBranch, setActiveBranch } = useBranchSwitcher();
```

### Edit Drawer Stores

Each editable entity has a Zustand store controlling its edit drawer:

| Store | File | Controls |
|-------|------|----------|
| `useEditStudent` | `hooks/use-edit-student.ts` | Student edit drawer |
| `useEditTeacher` | `hooks/use-edit-teacher.ts` | Teacher edit drawer |
| `useEditCourse` | `hooks/use-edit-course.ts` | Course edit drawer |
| `useEditRoom` | `hooks/use-edit-room.ts` | Room edit drawer |
| `useEditBranch` | `hooks/use-edit-branch.ts` | Branch edit drawer |
| `useEditEmployee` | `hooks/use-edit-employee.ts` | Employee edit drawer |
| `useEditHoliday` | `hooks/use-edit-holiday.ts` | Holiday edit drawer |

All follow the same pattern:

```typescript
interface EditDrawerState {
  isOpen: boolean;
  selected: T | null;
  open: (item: T) => void;
  close: () => void;
}
```

### useLeadsBoard

**File:** `hooks/use-leads-board.ts`

Manages the Kanban board state for leads (drag-and-drop columns).

### useAddStudentFromLead

**File:** `hooks/use-add-student-from-lead.ts`

Controls the drawer for converting a lead into a student.

## TanStack React Query

Used for all server data fetching. The `QueryClientProvider` is set up in the root layout.

### Usage Pattern

```typescript
// Fetching data
const { data, isLoading } = useQuery({
  queryKey: ['users', { page, user_type, branch_id }],
  queryFn: () => api.get('/users', { params }).then(res => res.data),
});

// Mutating data
const mutation = useMutation({
  mutationFn: (data) => api.post('/users', data),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
});
```

### Query Key Conventions

- Entity lists: `['users']`, `['branches']`, `['courses']`
- With filters: `['users', { page, user_type, branch_id }]`
- Single entity: `['users', userId]`

## State Persistence

| State | Persistence | Location |
|-------|-------------|----------|
| Auth (user, tokens) | Cookies | `js-cookie` |
| Branch selection | Memory only | Resets on refresh |
| Edit drawer state | Memory only | Resets on refresh |
| API cache | Memory only | Managed by React Query |
