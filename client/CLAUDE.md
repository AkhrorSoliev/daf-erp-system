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

#### Prices and Currency

- **Display format:** Use comma as thousands separator. Numbers below 1,000 have no separator. Examples:
  - `500`, `1,000`, `1,500`, `300,000`, `450,000`, `1,500,000`, `2,000,000`
- **Stored value:** Always store as a plain number without separators (e.g. `200000`, not `"200,000"`)
- **Currency suffix:** **so'm** — e.g. `1,500,000 so'm`
- **Negative balances:** prefix with `-`, e.g. `-50,000 so'm`
- **Formatting function:** Use `price.toLocaleString("en-US")` or a regex replacer `price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")` to convert the stored number to display format
- **Price inputs:** All price inputs must use the shared `<PriceInput>` component from `src/components/ui/price-input.tsx`. It live-formats digits with commas as the user types (e.g. typing `1500000` shows `1,500,000`), appends a `so'm` suffix addon, and stores raw digits without separators in form state. When using with `react-hook-form`, wrap with `<Controller>` instead of `register()`

### Tables and Pagination

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
- For error messages from the server, prefer extracting `error?.response?.data?.message` and falling back to a generic Uzbek message
- The `<Toaster />` component is configured globally in `src/app/layout.tsx` — do **not** add it elsewhere
- Import: `import toast from "react-hot-toast"`

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

### Code Organization

- Keep files small, focused, and maintainable
- Colocate related files (component + its types + its utils)
- Shared utilities go in `src/lib/`, shared components in `src/components/`
