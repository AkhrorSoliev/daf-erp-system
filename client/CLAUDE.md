@AGENTS.md

# DaF Sprachzentrum — ERP System (Frontend)

An ERP system for **DaF Sprachzentrum** language school. Manages branches, staff, teachers, and students across multiple roles.

> **Language:** The entire UI of this project is in **Uzbek** (O'zbek tili). All labels, placeholders, messages, and user-facing text must be written in Uzbek.

## Roles

- **CEO** (id: 1) — Full system access
- **Branch Director** (id: 2) — Branch-level management
- **Administrator** (id: 3) — System administration
- **Teacher** (id: 4) — Teaching and class management
- **Cashier** (id: 5) — Payment management
- A user can have **multiple roles** (many-to-many via `UserRole` table)

The system supports **multiple branches** (filials).

### Portal-Based Role Restriction (Subdomain Routing)

The frontend is deployed to multiple subdomains — each portal restricts which roles can log in:

| Portal | Domain | Allowed Roles |
|--------|--------|---------------|
| Admin panel | `admin.dafzentrum.uz` | CEO (1), Branch Director (2), Administrator (3), Cashier (5) |
| Teacher portal | `lehrer.dafzentrum.uz` | Teacher (4) |
| Student portal | `student.dafzentrum.uz` | Not yet implemented |

- **Restriction is enforced server-side** — the backend checks the `Origin` header on login and rejects users whose roles don't match the portal (see `portal-roles.config.ts`)
- **Error handling:** If login is rejected due to role mismatch, the API returns `403 Forbidden` with message "Sizning rolingiz bu portalga kirish huquqiga ega emas"
- **Localhost:** No restriction — all roles can log in during development
- The same frontend codebase is deployed to all three portals; the backend controls who can access what

### Role-Based Access Control (RBAC) — Frontend Rules

> See full permission matrix: `docs/role-access.md`

**CRITICAL: Hiding a page or UI element on the frontend is NOT sufficient security.** Every role-based restriction must be enforced on **BOTH frontend AND backend**. Frontend hides/disables UI; backend rejects unauthorized API calls. A user can bypass any frontend restriction by calling the API directly — the backend is the only real security boundary.

**When restricting access for any role:**
1. **Frontend:** Hide the page/route, sidebar link, button, tab, or UI element entirely (not just disable — remove from DOM)
2. **Backend:** Add `@Roles()` guard on the corresponding controller endpoint so the API returns `403 Forbidden` for unauthorized roles
3. **Both layers must always be in sync** — if a feature is hidden on the frontend, the backend must also reject the request, and vice versa

This applies to **all roles** — not just teachers. Whenever a role should not have access to a page, feature, or action, enforce it on both sides.

#### Role hierarchy

1. **CEO** — full access to everything across all branches
2. **Branch Director** — full access but **only within their own branch**
3. **Administrator** — operational access (CRUD for groups, teachers, students, etc.)
4. **Teacher** (id: 4) and **Cashier** (id: 5) — limited access (details TBD)

#### Frontend role-check pattern

Use the `useAuth` hook and check roles by **ID** (not name):

```tsx
const user = useAuth((s) => s.user);
const canManage = user?.roles.some((r) => [1, 2, 3].includes(r.id)) ?? false;   // CEO, BD, Admin
const canSeeSalary = user?.roles.some((r) => [1, 2].includes(r.id)) ?? false;    // CEO, BD only
```

- **Conditionally render** UI elements (buttons, tabs, columns) based on role — do not just disable them, **hide** them entirely
- **Salary/financial data** (ish haqi, balans) is visible **only to CEO (1) and Branch Director (2)**
- **Group create/update/delete** is allowed for **CEO (1), Branch Director (2), Administrator (3)**
- Navigation items use `hideForTeacher` flag in `src/lib/nav-items.ts` — filtered in `AppSidebar` based on user roles
- When adding a new role-restricted feature: always add the restriction in both the component (frontend) and the controller (backend). **Never** add a frontend-only restriction without a corresponding backend guard

## Tech Stack

### Backend

- **NestJS** (TypeScript) — API framework
- **Prisma ORM** — Database access
- **PostgreSQL** — Primary database
- **Redis** — Caching
- **Docker** — Containerization
- **JWT + Passport** — Authentication
- **bcryptjs** — Password hashing
- **class-validator** — DTO validation

### Frontend

- **Next.js** (TypeScript) — React framework
- **Tailwind CSS + shadcn/ui** — Styling and UI components
- **zustand** — Client state management
- **@tanstack/react-query** — Server state management and API cache
- **axios** — HTTP client
- **react-hook-form + zod** — Form handling and validation
- **recharts** — Charts and dashboards
- **date-fns** — Date formatting and manipulation
- **react-hot-toast** — Toast notifications
- **js-cookie** — Cookie management (token storage)

## Authentication

- JWT with **access token (1h)** + **refresh token (24h)**
- Tokens stored in cookies via `js-cookie`
- Axios interceptor in `src/lib/api.ts` auto-attaches token and auto-refreshes on 401
- `src/middleware.ts` redirects unauthenticated users to `/login`
- Auth state managed by Zustand store in `src/hooks/use-auth.ts`
- `AuthProvider` in `src/components/providers/auth-provider.tsx` hydrates state from cookies on mount

## Architecture Rules

### Server-First Rendering

- All pages MUST be Server Components by default
- Only extract Client Components (`"use client"`) when interactivity is needed (forms, buttons, state)
- Keep Client Components small and push them to the leaves of the component tree

### File Size and Responsibility

- **One file = one responsibility** (Single Responsibility Principle)
- Components: **100–300 lines** target
- Hard maximum: **500 lines**
- Split large components into smaller, reusable parts
- **Golden rule:** If a new developer cannot understand the file in a few minutes — refactor it

### Tooltips for UI Guidance

- Add **tooltips** to important or non-obvious UI elements (icons, buttons, form fields, status badges, etc.) to provide short explanations
- Tooltip text must be in **Uzbek**, consistent with the rest of the UI
- Use the shadcn/ui `<Tooltip>` component (`<TooltipProvider>`, `<Tooltip>`, `<TooltipTrigger>`, `<TooltipContent>`)
- Keep tooltip text concise — one short sentence or a few words is enough

### Formatting Conventions

#### Phone Numbers

- Display format: **+998 XX XXX XX XX** (with spaces)
- All phone inputs must have a **non-editable `+998` prefix** at the start of the field
- The user only enters the remaining 9 digits in the format `XX XXX XX XX`
- Use an input addon/prefix pattern (non-editable text before the input area)
- **Live formatting:** As the user types, digits must be auto-formatted with spaces in real time (`XX XXX XX XX`). The placeholder must also show this format
- Use the shared `<PhoneInput>` component from `src/components/ui/phone-input.tsx` — it handles formatting, placeholder, prefix, and `inputMode="numeric"` automatically
- The component stores **raw 9 digits** (no spaces) in form state while displaying the formatted value. When using with `react-hook-form`, wrap with `<Controller>` instead of `register()`

#### Dates and Times

- Date-only display format: **dd.MM.yyyy** — e.g. `21.03.2026`
- Date + time display format: **dd.MM.yyyy, HH:mm:ss** — e.g. `21.03.2026, 14:05:30`
- Use the time variant only when the time component is meaningful in context (e.g. activity logs, audit trails, timestamps)
- Use `date-fns/format` with the pattern `dd.MM.yyyy` or `dd.MM.yyyy, HH:mm:ss`
- **All date inputs** must use the shared `<DatePicker>` component from `src/components/ui/date-picker.tsx`. It renders a button that opens a calendar popover (built on shadcn/ui `<Calendar>` + `<Popover>`), displays the selected date in `dd.MM.yyyy` format, and returns a `Date` object. When using with `react-hook-form`, wrap with `<Controller>` instead of `register()`
- **All time inputs** must use the shared `<TimePicker>` component from `src/components/ui/time-picker.tsx`. It renders a button that opens a popover with a scrollable list of times (30-minute intervals, 00:00–23:30), displays the selected time, and returns a `HH:mm` string. When using with `react-hook-form`, wrap with `<Controller>` instead of `register()`
- **Never** use plain text `<Input>` for date or time entry — always use `<DatePicker>` or `<TimePicker>` so users select from a picker

#### User and Student IDs

- **User** (teacher, admin, CEO...) and **Student** IDs are always **5-digit integers** (10000+)
- The backend guarantees this — the frontend should expect and display 5-digit numeric IDs for users and students

#### Prices and Currency

- **Display format:** Use comma as thousands separator. Numbers below 1,000 have no separator. Examples:
  - `500`, `1,000`, `1,500`, `300,000`, `450,000`, `1,500,000`, `2,000,000`
- **Stored value:** Always store as a plain number without separators (e.g. `200000`, not `"200,000"`)
- **Currency suffix:** **so'm** — e.g. `1,500,000 so'm`
- **Negative balances:** prefix with `-`, e.g. `-50,000 so'm`
- **Formatting function:** Use `price.toLocaleString("en-US")` or a regex replacer `price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")` to convert the stored number to display format
- **Price inputs:** All price inputs must use the shared `<PriceInput>` component from `src/components/ui/price-input.tsx`. It live-formats digits with commas as the user types (e.g. typing `1500000` shows `1,500,000`), appends a `so'm` suffix addon, and stores raw digits without separators in form state. When using with `react-hook-form`, wrap with `<Controller>` instead of `register()`

### Tables and Pagination

#### Row Number Column (`#`)

- **Every data table must have a `#` (tartib raqami) column as the first column.** It displays the sequential row number (1, 2, 3, …).
- The `#` column must be **visually separated** from other columns with a **right border**: add `border-r` to both the `<TableHead>` and `<TableCell>` of the `#` column.
- For **paginated** tables, compute the number as `(page - 1) * pageSize + index + 1` so numbering continues across pages.
- For **non-paginated** tables, simply use `index + 1`.
- Apply `className="w-12 border-r"` on the `<TableHead>` and `className="border-r text-muted-foreground"` on the `<TableCell>`.

#### Table Header Styling

- Table headers (`<TableHeader>`) must have a **subtle background** to distinguish them from body rows. This is handled globally in the base `<TableHeader>` component (`src/components/ui/table.tsx`) with `bg-muted/40`. **Do not override or remove** this background in individual tables.
- The background must be visible in **both light and dark modes** — `bg-muted/40` satisfies this requirement with shadcn/ui's CSS variables.

#### Pagination Rules

- All data tables **must default to showing 10 rows per page**.
- Every table must include a **page size selector** allowing the user to choose from: **10, 20, 30, 40, 50** rows per page.
- Changing the page size must reset the current page back to 1.
- Display the total record count and current page / total pages in the pagination controls.
- Use `useState` for `page` and `pageSize` in the client wrapper component (not inside the table component itself).
- The table component only receives the already-paginated slice of data as a prop — it does not handle pagination logic internally.

### Filter Bars

- **No labels** — filter bars must not use `<Label>` elements above inputs or selects. The UI should be self-explanatory through placeholders and select option text alone.
- **Text inputs** use a descriptive `placeholder` that explains what they filter, e.g. `"Ism bo'yicha qidirish..."`, `"ID bo'yicha qidirish..."`.
- **Select filters** must have a descriptive default ("all") option that includes the filter category name, so the user always knows what the select controls — even when no specific filter is chosen:
  - Correct: `"Barcha holatlar"`, `"Barcha darajalar"`
  - Wrong: `"Barchasi"` (ambiguous when multiple selects are present)
- Do **not** use `placeholder` on `<SelectValue>` — use a real `<SelectItem value="all">` as the default option instead.
- Align filter controls to `items-center` (not `items-end`) since there are no labels to align around.

### Sidebar Active State

- Sidebar navigation links must use `pathname.startsWith(item.url)` for active state detection — **not** exact match (`pathname === item.url`)
- This ensures the link stays highlighted when navigating to nested/child routes (e.g. `/settings/courses` stays active on `/settings/courses/1`)
- Exception: the home route (`/`) must use exact match (`pathname === "/"`) to avoid matching every route

### Toast Notifications

- **Every API mutation** (create, update, delete) **must** show a toast notification for both success and error outcomes using `react-hot-toast`
- Use `toast.success("message")` after a successful mutation and `toast.error("message")` in the catch block
- Toast messages must be in **Uzbek**, concise, and describe what happened — e.g. `"Filial muvaffaqiyatli yangilandi"`, `"Saqlashda xatolik yuz berdi"`
- **Error messages must never be technical or in English** — always show user-friendly Uzbek text. The backend returns Uzbek messages in `error.response.data.message` — use them when available, fall back to a context-specific Uzbek string
- The `<Toaster />` component is configured globally in `src/app/layout.tsx` — do **not** add it elsewhere
- Import: `import toast from "react-hot-toast"`

#### Error Message Extraction

- Use the shared `getErrorMessage` utility from `src/lib/get-error-message.ts` to extract error messages from API responses:
  ```tsx
  import { getErrorMessage } from "@/lib/get-error-message";
  toast.error(getErrorMessage(error, "Saqlashda xatolik yuz berdi"));
  ```
- The utility handles both string and array messages (validation errors return `string[]`) and provides a fallback
- **403 errors (permission denied) are handled globally** in the axios interceptor (`src/lib/api.ts`) — the interceptor shows a toast with the server's Uzbek message (e.g. `"Sizga bu amalni bajarishga ruxsat yo'q"`). Components do **not** need to handle 403 separately
- **401 errors (unauthenticated) are handled globally** in the axios interceptor — auto-refreshes the token or redirects to `/login`
- For all other errors (400, 404, 500, etc.), handle in the component's catch block with a context-specific Uzbek fallback message

### UI Reactivity After Mutations (Optimistic Updates)

- **All mutations must use optimistic updates** — the UI must reflect the change **instantly** using the API response data, without waiting for a separate refetch. The only exception is **financial data** (balances, payments, salaries) which must always refetch from the server to ensure accuracy.
- **UPDATE/DELETE pattern:** The API response (or the deleted ID) is used to update local state directly via `setState(prev => ...)`. Never refetch the entire list just to reflect an update or delete.
- **CREATE pattern:** For paginated lists, a refetch is acceptable (new item may appear on a different page). For non-paginated data, append directly to local state.
- **Callback convention:** `onSaved(data)` passes the API response to the parent. `onDeleted(id)` passes the deleted entity's ID. Parents use these to update local state instantly.
- If a Zustand store holds cached data (e.g. branch list in navbar), expose a `refetch` method and call it after relevant mutations
- Prefer updating shared Zustand stores over local component state when the data is used in multiple places (e.g. branch list appears in both the navbar switcher and settings page)
- After a successful create/update/delete, update **all** visible representations of that data: tables, dropdowns, sidebars, badges, etc.

### Breadcrumbs

- Breadcrumbs are rendered globally in `DashboardHeader` via the `<AppBreadcrumb>` component (`src/components/app-breadcrumb.tsx`)
- Static route labels are defined in `src/lib/breadcrumb-routes.ts` — add new entries when creating new routes
- **Dynamic segments** (IDs) must display the entity **name** instead of the raw ID. Use the `useBreadcrumbName` hook (`src/hooks/use-breadcrumb-name.ts`) in the detail/profile client component:
  ```tsx
  const setName = useBreadcrumbName((s) => s.setName);
  useEffect(() => { setName(id, entity.name); }, [id, entity.name, setName]);
  ```
- Example: `/settings/branches/1001` should show `Bosh sahifa > Sozlamalar > Filiallar > Asosiy filial` — **not** `#1001`
- Every new detail page with a dynamic `[id]` segment **must** call `setName()` after loading the entity data

### Loading States for Async Data

- **Every UI that fetches data from the backend must show a loading indicator** while the request is in flight — tables, drawers, forms, detail pages, select dropdowns, etc.
- Never render an empty or broken UI while data is loading. The user must always see a clear visual signal that content is being fetched.
- **Prefer skeleton placeholders over spinners** — skeletons give the user a sense of the content layout before it loads and feel faster. Use the shadcn/ui `<Skeleton>` component (`src/components/ui/skeleton.tsx`).
- For **lists/feeds** (e.g. comment list, notification list): show 3 skeleton items that mimic the shape of a real item (avatar circle + text lines). Never show a bare spinner for list content.
- For **drawers/dialogs with forms** that load options (e.g. select lists for courses, rooms, teachers): show a centered spinner or skeleton until all required data has loaded. Disable the form submit button while loading.
- For **tables**: show skeleton rows in the table body area while rows are loading.
- For **detail pages**: show a full-page skeleton layout that mimics the page structure until the entity data is available.
- Use a simple `Loader2` spinning icon from `lucide-react` with `animate-spin` class **only** for inline indicators (button loading, small async operations). For page-level or section-level loading, always prefer skeletons.

### Submit Loading State in Drawers and Dialogs

- **Every drawer/dialog that submits data to the backend must show a loading state on the submit button** while the request is in flight
- Use `Loader2` spinner inside the button with `animate-spin` and disable the button during submission
- Also disable the cancel/close button during submission to prevent the user from closing the drawer before the request completes
- Pattern: the form component exposes an `onSubmittingChange?: (submitting: boolean) => void` callback. The parent drawer/dialog tracks this via `useState` and passes it to both the form and the footer buttons
- Never allow a user to click "Save" / "Submit" multiple times — always disable after the first click until the request resolves

### Lazy Data Fetching in Tabs

- **Tab-specific data must only be fetched when the user switches to that tab** — not on page mount
- This avoids unnecessary API requests for tabs the user may never visit
- Use `onValueChange` on the `<Tabs>` component to detect tab switches, and trigger the fetch on first activation
- Use a `useRef` flag (e.g. `fetched.current`) to ensure the data is fetched only once per mount — subsequent tab switches should not re-fetch
- Show a loading spinner inside the tab content while the request is in flight
- This rule applies to all tabbed UIs across the application (profile pages, detail pages, settings, etc.)

### Entity History in Tabs

- Several detail/profile pages have a **"Tarix" (History) tab** that displays the full change log for that entity
- Pages with history tabs: **Student Profile**, **Group Detail**, **Teacher Profile** — and any future detail page that needs audit visibility
- **History data must always come from the backend** — never hardcode, mock, or generate history on the frontend
- API endpoint: `GET /api/entity-history/:entityType/:entityId?page=1&pageSize=20`
  - `entityType` values: `Student`, `Group`, `User` (for teachers), `Branch`, `Room`, `Course`, `Lead`, `Holiday`, `Enrollment`
  - Response: `{ data: [...], total, page, pageSize }` — each entry has `action`, `oldValues`, `newValues`, `changedBy: { id, name }`, `createdAt`
- **All entity changes are recorded by the backend automatically** — every create, update, delete, status change, and restore is logged in the `EntityHistory` table
- Follow the **lazy tab loading** pattern: only fetch history when the user switches to the "Tarix" tab (use `onValueChange` + `useRef` flag)
- Display history as a timeline or table showing: date/time, who made the change, what action (created, updated, deleted, status changed, restored), and what fields changed (old → new values)
- Use the `dd.MM.yyyy, HH:mm:ss` date format for history timestamps (audit trails require time precision)
- When adding a new entity detail page with a "Tarix" tab, simply call the same `/api/entity-history/:entityType/:entityId` endpoint with the correct `entityType`

#### Shared `EntityHistoryTable` component

- Located at `src/components/shared/entity-history-table.tsx` — **reusable** across all detail pages
- Props: `entityType: string` and `entityId: string | number`
- Handles fetching, pagination (20 per page), loading state, and empty state internally
- Action badges: "Yaratildi" (green), "Yangilandi" (blue), "O'chirildi" (red), "Status o'zgardi" (gray), "Tiklandi" (green)
- **CREATE**: shows first 3 new field values + overflow count
- **DELETE**: shows "Barcha ma'lumotlar arxivlandi"
- **UPDATE/STATUS_CHANGE**: shows old (red strikethrough) → new (green) for each changed field
- User column shows `changedBy.name` or "Tizim" (System) if null
- To add history to a new detail page:
  ```tsx
  import { EntityHistoryTable } from "@/components/shared/entity-history-table";
  // In the "Tarix" tab content:
  {historyVisible && <EntityHistoryTable entityType="Branch" entityId={branch.id} />}
  ```

### Student Filters

- **Single search field** for name, phone, and ID — placeholder: "Ism, telefon yoki ID bo'yicha..."
- Removed separate `id` filter and `groupLevel` filter — all search is now server-side via `?search=` param
- **Status options**: Barcha holatlar, Faol, Muzlatilgan, Guruhlashtirilmagan, Bitirgan, Chetlatilgan
- **Branch filtering**: automatically filters by selected branch (`selectedBranch?.id` → `?branch_id=`)
- Filter changes always reset pagination to page 1
- No client-side filtering — all filtering is done server-side for consistency and performance

### Comments & Task Assignment (Izohlar)

- **"Izohlar" tab** mavjud: Student Profile, Teacher Profile — comment list + form ko'rsatadi
- **Shared komponentlar:**
  - `src/components/shared/comment-list.tsx` — izohlar ro'yxati (oddiy + topshiriq), pagination, assignee status tugmalari
  - `src/components/shared/comment-form.tsx` — izoh yozish formasi, CEO/BD uchun "Topshiriq sifatida" switch + assignee tanlash
- **Topshiriq (task)** commentlar sariq border bilan ajralib turadi, assignee badges ko'rsatadi
- **Assignee tugmalari:** "Ko'rdim" (SEEN) va "Bajarildi" (DONE) — faqat o'ziga assign qilingan comment da ko'rinadi
- **Eslatma section** (student profile card): `GET /api/comments/latest` dan eng so'nggi izoh ko'rsatadi, fallback: `student.comment`
- Lazy loading pattern: izohlar faqat "Izohlar" tab ochilganda yuklanadi
- Yangi entity detail sahifasiga izoh qo'shish uchun:
  ```tsx
  import { CommentList } from "@/components/shared/comment-list";
  import { CommentForm } from "@/components/shared/comment-form";
  <CommentForm entityType="Student" entityId={id} onCreated={handleRefresh} />
  <CommentList entityType="Student" entityId={id} refreshKey={key} />
  ```

### Notifications (Bildirishnomalar)

- **NotificationBell** (`src/components/notifications/notification-bell.tsx`) — navbar dagi qo'ng'iroq icon + badge + dropdown
- **Zustand store** (`src/hooks/use-notifications.ts`) — notifications, unreadCount, markRead, markAllRead
- **SSE hook** (`src/hooks/use-sse.ts`) — fetch-based SSE (JWT Authorization header bilan), auto-reconnect
- **Push hook** (`src/hooks/use-push-notifications.ts`) — service worker registration + push subscription
- **Service Worker** (`public/sw.js`) — push event handler, notification click → sahifaga navigate
- **Real-time:** SSE orqali yangi notification kelganda badge soni oshadi va dropdown ga qo'shiladi
- Notification click → tegishli entity sahifasiga navigate (relatedEntityType/Id asosida)

### Testing

- **Every change must be tested before the work is considered complete.** No exceptions — untested code is unfinished code.
- **After every meaningful frontend change, verify the app builds without errors** by running `npm run build` — a broken build means the work is not done
- **After every backend change, run the full backend test suite** (`cd server && npm test`) and confirm all tests pass
- If a backend service or controller was added or modified, corresponding `*.spec.ts` tests **must** be written or updated — do not skip this step
- **Controller guard tests are mandatory** — when adding or modifying `@Roles()` guards on controller endpoints, write tests that verify the role metadata and that `RolesGuard` allows/denies the correct roles
- When both frontend and backend are changed in the same task, verify both: `npm run build` (client) and `npm test` (server)

### Code Organization

- Keep files small, focused, and maintainable
- Colocate related files (component + its types + its utils)
- Shared utilities go in `src/lib/`, shared components in `src/components/`

## Available Skills

Skills are specialized knowledge modules that **must** be activated when working on related tasks. Before starting any task, identify which skills are relevant and invoke them.

### Slash Commands (`.claude/commands/`)

| Command | When to use |
|---------|-------------|
| `/deploy` | Vercel + Railway + Auto-Merge deploy qilish |
| `/restart` | Dev serverlarni qayta ishga tushirish |
| `/team-deploy` | Xavfsiz jamoa deploy |
| `/team-merge` | Xavfsiz PR merge |

### Agent Skills (`.agents/skills/`)

| Skill | When to use |
|-------|-------------|
| `frontend-design` | UI dizayn, layout, styling ishlari |
| `web-design-guidelines` | Web dizayn qoidalari va best practices |
| `vercel-react-best-practices` | React performance, rendering, async, bundle optimization |
| `vercel-composition-patterns` | Compound components, state management, React 19 patterns |
| `deploy-to-vercel` | Vercel ga deploy qilish |
| `documentation-writer` | Texnik hujjatlar yozish |

### Context7 Skills (auto-triggered)

| Skill | When to use |
|-------|-------------|
| `typescript-expert` | TypeScript type-level programming, performance, migration |
| `docker-expert` | Docker containerization, multi-stage builds |
| `prisma-client-api` | Prisma query, filter, CRUD operations (frontend types uchun ham) |

### Skill Usage Rule

**Har bir task boshlanishida tegishli skillni aniqlash va faollashtirish shart:**

1. **UI komponent yaratish/o'zgartirish** → `frontend-design` + `vercel-react-best-practices`
2. **Component architecture** → `vercel-composition-patterns`
3. **TypeScript xatolik yoki murakkab tiplar** → `typescript-expert`
4. **Deploy qilish** → `/deploy` yoki `deploy-to-vercel`
5. **Prisma modellar bilan ishlash** → `prisma-client-api`
6. **Docker bilan ishlash** → `docker-expert`
