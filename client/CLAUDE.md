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
| Student portal | `student.dafzentrum.uz` | Student (6) — implemented in `src/components/student-portal/` (home, profile, schedule, attendance history, payments via Payme + Click) |

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
- Navigation items use `visibleForRoles?: number[]` whitelist in `src/lib/nav-items.ts` — `AppSidebar` shows the item only when the user has one of the listed role IDs. Items without the field are visible to everyone.
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

**EXCEPTION — sign-in identifier fields, do NOT "fix" these:** `client/src/app/(auth)/login/login-form.tsx` and `client/src/app/(auth)/login/student-login-form.tsx` deliberately violate the prefix and component rules above. Their identifier field uses a bare, non-editable `+` prefix (not `+998`), does **not** use `<PhoneInput>`, and has **no 9-digit cap** — the user types the country code as part of the number (`998 90 123 45 67`). This is intentional: sign-in must also accept foreign numbers whose country code is part of the stored identifier, and the server (`AuthService.validateUser`, via `normalizeSharedPhone`) normalizes and matches whatever was typed — Uzbek or foreign. **Do not restore the `+998` prefix, the 9-digit cap, or `<PhoneInput>` on these two forms** — doing so would re-break sign-in for foreign-number accounts. They DO live-format, but with their own grouping: `formatPhoneWithCodeInput` (`src/lib/format-utils.ts`) renders `XXX XX XXX XX XX` while the state keeps raw digits, and digits past the fifth group are appended rather than cut, so a foreign number of any E.164 length (max 15) survives typing intact — see `format-utils.test.ts`. The password-reset dialog, `client/src/components/auth/forgot-password-dialog.tsx`, is NOT part of this exception — it keeps the full `+998` rule above, because Eskiz (the SMS provider) only delivers OTP codes to Uzbek numbers.

#### Telegram sign-in button

- Both login forms render `<TelegramLoginButton />` (`src/components/auth/telegram-login-button.tsx`) under the password form. It **self-hides** unless `GET /auth/telegram/status` reports `enabled` — the OAuth credentials are configured by hand, so an unconfigured environment must show no button rather than a broken one.
- Clicking it asks the backend for the authorize URL (`GET /auth/telegram/start`) and navigates there. The client never builds the Telegram URL itself and never holds the PKCE verifier.
- Telegram returns to the API, which 302s to `/auth/telegram/callback?handoff=…` on this app. That page exchanges the single-use handoff for tokens (`POST /auth/telegram/complete`), calls `setAuth`, and redirects (student → `/portal`, everyone else → `/`).
- **The same page also handles `?error=<message>`** — a server-side failure after the OAuth `state` was consumed 302s here with a human-readable Uzbek message instead of stranding the user on raw JSON at the API domain. Both `error` and the missing-`handoff` fallback are computed in the `useState` **lazy initializer**; do not move them into the effect (`react-hooks/set-state-in-effect`).
- **The callback page must stay wrapped in `<Suspense>`** — it reads `useSearchParams`, which bails out of static prerendering without a boundary and fails `npm run build`.

#### Admin login backdrop (liquid glass)

- `admin.dafzentrum.uz`'s login (`app/(auth)/login/page.tsx`, the `portal === "admin"` branch only — teacher/student portals are untouched) renders `/login-admin-background.jpg` full-bleed through `next/image` (`fill priority sizes="100vw"`) with a dark scrim over it, and puts the form on a `.liquid-glass` pane.
- `.liquid-glass` lives in `globals.css` (`@layer components`) and owns the whole look: tinted translucency + `backdrop-filter: blur(40px) saturate(190%)`, an inset rim that reads as refracted light, specular pools (`::before`), a one-pass load sheen (`::after`, disabled under `prefers-reduced-motion`) and the `overflow: hidden` that clips it. Do not re-add `bg-background/*`, `border` or `shadow-*` utilities on the pane — they fight the class.
- **Never put a CSS comment inside a declaration value in `globals.css`** (e.g. between the shadows of a multi-line `box-shadow`). Tailwind v4 and the Tailwind CLI accept it, but Next's Lightning CSS pass silently drops the **entire enclosing `@layer` block** — the classes just never reach the browser, with no error. Keep comments above the declaration.

#### Dates and Times

- Date-only display format: **dd.MM.yyyy** — e.g. `21.03.2026`
- Date + time display format: **dd.MM.yyyy, HH:mm:ss** — e.g. `21.03.2026, 14:05:30`
- Use the time variant only when the time component is meaningful in context (e.g. activity logs, audit trails, timestamps)
- Use `date-fns/format` with the pattern `dd.MM.yyyy` or `dd.MM.yyyy, HH:mm:ss`
- **All date inputs** must use the shared `<DatePicker>` component from `src/components/ui/date-picker.tsx`. It renders a button that opens a calendar popover (built on shadcn/ui `<Calendar>` + `<Popover>`), displays the selected date in `dd.MM.yyyy` format, and returns a `Date` object. When using with `react-hook-form`, wrap with `<Controller>` instead of `register()`
- **All time inputs** must use the shared `<TimePicker>` component from `src/components/ui/time-picker.tsx`. It renders a button that opens a popover with a scrollable list of times (30-minute intervals, 00:00–23:30), displays the selected time, and returns a `HH:mm` string. When using with `react-hook-form`, wrap with `<Controller>` instead of `register()`
- **TimePicker scroll fix:** The component uses `modal` prop on `<Popover>` + `overscroll-contain` on the scroll container to ensure touchpad scrolling works correctly inside the Radix Popover (same pattern as teacher select in the group form). Do **not** remove `modal` — without it, touchpad scroll does not work
- **Never** use plain text `<Input>` for date or time entry — always use `<DatePicker>` or `<TimePicker>` so users select from a picker

#### Date Range Pickers

- Whenever two `<DatePicker>`s form a range (e.g. "Boshi — Oxiri", "Boshlanish — Tugash", custom report period, attendance stats period), they **must** be wired as a pair, not as two independent inputs.
- The **end picker** must receive `minDate={startDate}` and `defaultMonth={startDate}` — so when the user has picked the start, opening the end calendar jumps to the start's month and blocks earlier days.
- The **start picker** must receive `maxDate={endDate}` and `defaultMonth={endDate}` — so picking start after an already-chosen end is impossible, and its calendar jumps to that month.
- Both props use the shared `<DatePicker>` from `src/components/ui/date-picker.tsx` (`minDate` / `maxDate` / `defaultMonth`). Do not re-implement this in individual components.
- This rule applies to **every** range picker in the app — filter bars, forms with a from/to period, reports, gateway event logs, etc. If you find an existing range pair without these props, fix it when you touch that file.

#### User and Student IDs

- **User** (teacher, admin, CEO...) and **Student** IDs are always **5-digit integers** (10000+)
- The backend guarantees this — the frontend should expect and display 5-digit numeric IDs for users and students

#### Numbers, Prices and Currency

- **Locale:** All number formatting uses **`uz-UZ`** — Uzbek convention is space (`U+00A0`) as thousands separator and comma as decimal separator.
- **Display format:** Numbers below 1,000 have no separator; thousands use space. Examples:
  - `500`, `1 000`, `1 500`, `300 000`, `450 000`, `1 500 000`, `2 000 000`
- **Stored value:** Always store as a plain number without separators (e.g. `200000`, not `"200 000"`)
- **Currency suffix:** **so'm** — e.g. `1 500 000 so'm`
- **Negative balances:** prefix with `-`, e.g. `-50 000 so'm`
- **Formatting helpers (`src/lib/format-utils.ts`):** Use these instead of inline `toLocaleString` calls — they centralise the locale and ensure visual consistency across the app:
  - `formatNumber(value, options?)` → "1 500" / "1 500.5"
  - `formatPercent(value, options?)` → "75.5%"
  - `formatBalance(balance)` → "1 500 000 so'm" / "-50 000 so'm"
  - `formatPrice(price)` → "1 500 000" (no currency)
- **Price inputs:** All price inputs must use the shared `<PriceInput>` component from `src/components/ui/price-input.tsx`. It live-formats digits with Uzbek-style spaces as the user types (e.g. typing `1500000` shows `1 500 000`), appends a `so'm` suffix addon, and stores raw digits without separators in form state. When using with `react-hook-form`, wrap with `<Controller>` instead of `register()`
- **Why uz-UZ:** the entire UI is in Uzbek — number formatting matches the rest of the language convention. Do **not** introduce `toLocaleString("en-US")` for new code; route through the helpers above so a future locale change is one file edit, not 30.

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

- **These rules apply to every data table in the project — including tables rendered inside dialogs, drawers, popovers, drill-down modals, and sheets. There is no exception for "modal" or "secondary" tables.**
- All data tables **must default to showing 10 rows per page**.
- Every table must include a **page size selector** allowing the user to choose from: **10, 20, 30, 40, 50** rows per page.
- Changing the page size must reset the current page back to 1.
- Display the total record count and current page / total pages in the pagination controls.
- Use `useState` for `page` and `pageSize` in the client wrapper component (not inside the table component itself).
- The table component only receives the already-paginated slice of data as a prop — it does not handle pagination logic internally.
- **Dialog/drawer drill-down tables:**
  - Keep `useState` for `page` / `pageSize` inside the dialog component, not at the page level (page-level URL state is not needed for modal-scoped pagination).
  - **Reset `page` to `1` whenever the dialog's target entity changes** (e.g. the user clicks a different segment/bar). Use `useEffect` watching the key identifier (`drilldown?.reasonId`, `row?.id`, etc.).
  - Keep the footer pagination controls inside `DialogContent` (next to the bottom, outside the scrolling table area) so they stay visible while the table body scrolls.
  - The pagination footer must occupy a non-shrinking slot (`shrink-0`) so the table above is the only scroll container.
  - Reference: `src/components/reports/departed-students/departed-students-reasons-chart.tsx` → `ReasonStudentsDialog`.

#### Row Actions Column

- **Every data table's "Amal" column must use a 3-dot dropdown** (`MoreHorizontal` icon → `<DropdownMenu>`), not inline icon buttons. A row with multiple actions (Tahrirlash, O'chirish, Tarix, etc.) gets noisy fast — the dropdown collapses them into one trigger and gives every action a labelled menu item.
- The trigger is a ghost `<Button size="icon">` containing `<MoreHorizontal />` and a visually-hidden `<span className="sr-only">Amallar</span>` for accessibility.
- Use `<DropdownMenuContent align="end">` so the menu opens to the left of the trigger and never gets clipped by the table edge.
- Menu items use lucide icons with `mr-2 size-4` spacing. Destructive items get `className="text-destructive focus:text-destructive"`.
- While a row's mutation is in flight (e.g. delete), replace the `<MoreHorizontal />` icon with `<Loader2 className="size-4 animate-spin" />` and disable the trigger so a second click can't fire.
- Reference: `src/components/settings/branch-row-actions.tsx`, `src/components/groups/lesson-changes-tab.tsx` (reschedules table).

### Confirmation Dialogs (Destructive Actions)

- **Never use the native `confirm()` browser API** for delete/destructive confirmations. It's unstyled, blocks the JS thread, can't render formatted Uzbek warnings or HTML, and looks completely out of place against the shadcn UI.
- Use the shadcn `<AlertDialog>` component (`src/components/ui/alert-dialog.tsx`) for every destructive confirmation: row delete from a table, archive, status reset, batch delete, etc.
- Standard shape: `<AlertDialogTitle>` (the question), `<AlertDialogDescription>` (the consequence — what data is affected, what cascades, what cannot be undone), `<AlertDialogCancel>Bekor qilish</AlertDialogCancel>`, and `<AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90">O'chirish</AlertDialogAction>`.
- For a list/table with multiple destructive actions sharing the same look-and-feel, hold a single `useState<{ title, description, onConfirm } | null>` and render one `<AlertDialog>` controlled by that state — each row's handler just calls `setConfirmDelete({ ... })`. Avoids one AlertDialog per row.
- Reference implementations: `src/components/teachers/teacher-profile-client.tsx` (single-action archive), `src/components/groups/lesson-changes-tab.tsx` (shared confirmDelete state across three different delete flows).

### Dialog / Modal Scroll Safety (MANDATORY — check before every dialog task)

- **Every Dialog and Sheet must stay scroll-safe when its content grows.** A centered modal that exceeds the viewport height must scroll **internally** — it must NEVER clip its top/bottom off-screen (the title and the action buttons must always be reachable). This is a recurring bug; **verify it before building or editing any dialog.**
- The base `<DialogContent>` (`src/components/ui/dialog.tsx`) already enforces a safety floor: `max-h-[90dvh] overflow-y-auto`. **Do not remove these** — without them tall dialogs get cut off. Short dialogs are unaffected (the cap simply never triggers).
- For any dialog with a **form, a list, or otherwise variable/long content**, use the **fixed header/footer + scrolling body** pattern so the title and buttons always stay visible while the middle scrolls:
  - `<DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">`
  - `<DialogHeader className="border-b px-6 py-4">` — fixed top
  - `<div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">…fields…</div>` — the ONLY scroll container
  - `<DialogFooter className="border-t px-6 py-4">…buttons…</DialogFooter>` — fixed bottom
- Reference: `src/components/payments/expenses-client.tsx`. The same skeleton applies to Sheets/drawers (`SheetContent p-0 flex flex-col` → header `border-b` → scrollable body → footer `border-t`).

### Searchable Select / Combobox (long option lists)

- A plain shadcn `<Select>` is fine for **short, fixed** option sets (payment method, status, category, yes/no).
- When a select lists **entities that can grow long** (employees, teachers, students, groups, rooms, courses), use a **searchable combobox**, not a bare `<Select>`:
  - A `<Popover modal>` trigger button showing the current selection (avatar + name for people).
  - A scrollable list: `max-h-60 overflow-y-auto overscroll-contain` — a few options (≤ ~7) render directly with no scroll; many options scroll.
  - A search `<Input>` shown **only when the list is long** (e.g. `length > 7`) — don't force a search box onto a 4-item list. Few → just show; many → scroll + search.
  - Keep `modal` on the `<Popover>` + `overscroll-contain` on the scroll area (touchpad scroll fix — same as TimePicker / group teacher select).
- Show **avatars** (photo + initials fallback) for person options.
- Reference: `src/components/groups/group-teacher-select.tsx`, `src/components/payments/employee-advance-select.tsx`.

### Filter Bars

- **No labels** — filter bars must not use `<Label>` elements above inputs or selects. The UI should be self-explanatory through placeholders and select option text alone.
- **Text inputs** use a descriptive `placeholder` that explains what they filter, e.g. `"Ism bo'yicha qidirish..."`, `"ID bo'yicha qidirish..."`.
- **Select filters** must have a descriptive default ("all") option that includes the filter category name, so the user always knows what the select controls — even when no specific filter is chosen:
  - Correct: `"Barcha holatlar"`, `"Barcha darajalar"`
  - Wrong: `"Barchasi"` (ambiguous when multiple selects are present)
- Do **not** use `placeholder` on `<SelectValue>` — use a real `<SelectItem value="all">` as the default option instead.
- Align filter controls to `items-center` (not `items-end`) since there are no labels to align around.

### URL-Persisted Filter State

- **Every filter bar on a list or report page must persist its state in the URL query string.** The URL is the single source of truth; React state is derived from `useSearchParams()`, not held independently in `useState`.
- **Why:** filters survive page refresh, are shareable via link, bookmarkable, and reflected in browser history — exactly the behavior users expect from a report.
- **Scope:** applies to all report pages (`/reports/*`), list pages (`/students`, `/teachers`, `/groups`, `/leads`, etc.), filter bars, and active tabs on detail pages (see "URL-Persisted Tab State" below). It does **not** apply to transient UI state like open dialogs or selected rows.
- **Implementation:**
  - Read with `useSearchParams()` from `next/navigation`. Parse values into the filter shape in a `useMemo` keyed on the `searchParams` object.
  - Write with `useRouter().replace(...)` (not `push`) so filter changes don't clutter browser history. Pass `{ scroll: false }` to prevent jump-to-top.
  - For scalar (string/number) filters, prefer the shared `useUrlFilters` hook (`src/hooks/use-url-filters.ts`). For arrays, dates, or nullables, inline `useSearchParams` + `useRouter` is fine — encode arrays as comma-separated strings (`groupIds=a,b,c`), dates as `yyyy-MM-dd`.
  - **Omit defaults from the URL.** If a filter equals its default (`branchId === null`, empty array, default status), `delete` it from the URLSearchParams so the URL stays short and meaningful.
  - **Reset `page` to `1`** when any filter changes (including pageSize).
- **Do not** call `router.replace` in a `useEffect` that reads state — that creates a render loop. Write the URL directly from the filter-change event handler instead.
- **Server params must match URL param names** where practical (e.g. URL `?startDate=...&endDate=...` passes through to the API as `startDate` / `endDate`). This avoids a translation layer and makes requests greppable from URLs.

### URL-Persisted Tab State

- **Every `<Tabs>` set in the app must persist its active tab in the URL — never `defaultValue` + local `useState`.** Reload, share, and back/forward navigation must restore the same tab the user was on. This applies to detail/profile pages, list/report pages, dashboards, nested sub-tabs, and tabs inside drawers/sheets alike.
- **Why:** users link colleagues to a specific tab (`/teachers/profile/10239?tab=ish-haqi`), and reloading the page must not drop them back to the default tab.
- **Scope:** all tabbed UIs. Current coverage — `/groups/[id]`, `/students/profile/[id]`, `/teachers/profile/[id]`, `/settings/courses/[id]`, `/settings/employees/[id]`, `/mock-exams/[id]`, `/tasks`, `/outreach`, `/reports/attendance`, the home dashboard schedule view, the leads detail drawer, and the outreach callbacks sub-filter. The only exemption is a `<Tabs>` with a **single** trigger (no navigation choice — e.g. `/reports/payment-reports`); it may stay uncontrolled. Add the pattern to any new tab set you introduce.
- **Implementation:** the parent `*-client.tsx` owns the URL ↔ tab state and passes `activeTab` + `onTabChange` to the tabs component:
  - Read: `const activeTab = searchParams.get("tab") ?? "<default>"`.
  - Write: `useCallback((tab) => { ... router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false }) }, [...])`.
  - **Omit the default tab from the URL** — when tab equals the default (e.g. `"guruhlar"`), `delete` the param so the URL stays clean.
  - The tabs component uses `<Tabs value={activeTab} onValueChange={handleTabChange}>` (NOT `defaultValue`).
- **Param naming — avoid collisions.** The plain `?tab=` belongs to the page-level tab set. Any tab set that can coexist with another in the same URL gets its own distinct param:
  - A second/nested tab set on the same page uses a prefixed name — e.g. attendance rankings use `?att_tab=`, the outreach callbacks sub-filter (nested under `?tab=callbacks`) uses `?cb=`.
  - A **view-mode toggle** (grid/list, not real navigation) uses a semantic name — the dashboard schedule uses `?view=`.
  - **Tabs inside a drawer/sheet** use their own param (the leads detail drawer uses `?lead_tab=`) and **must delete that param when the drawer closes** (clear it from every close path — the `onOpenChange` handler and any action button that dismisses the sheet) so it never lingers in the URL while the drawer is shut.
- **Lazy-load on direct URL navigation:** if any tab fetches data on first activation (history, izohlar, ish-haqi, tolovlar, etc.), wrap the fetch logic in a `useCallback` and call it from BOTH the click handler AND a `useEffect` keyed on `activeTab`. Without the effect, reloading on `?tab=ish-haqi` shows an empty tab because the click handler never fired. The `*Shown.current` ref guards keep it idempotent.
- Reference implementation: `group-detail-client.tsx` ↔ `group-detail-tabs.tsx` (page-level); `attendance-section.tsx` (prefixed param); `lead-detail-drawer.tsx` (drawer-scoped param with close cleanup).

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

### Charts and Data Visualization

These rules codify lessons learned while building `/reports/departed-students`. Every chart in the project — existing and future — must follow them.

#### Chart Library

- Use **`recharts`** (already installed) for all chart needs. **Do NOT install other chart libraries** (Tremor, Nivo, Chart.js, etc.) without explicit user approval — the project keeps chart code consistent.

#### SVG Color Pitfall: Avoid `hsl(var(--...))` in SVG Attributes

- `hsl(var(--popover))`, `hsl(var(--border))`, `hsl(var(--muted) / 0.3)`, etc. work fine in **HTML inline styles** (`backgroundColor`, `border` on a `<div>`) but **fail silently in SVG attributes** (`fill`, `stroke` on `<rect>`, `<text>`, `<path>` elements that Recharts renders internally).
- When CSS variable resolution fails in an SVG attribute, the attribute becomes empty and SVG defaults take over — **usually black fill** — which causes bugs like "tooltip cursor turns black on hover" or "axis labels unreadable in dark mode".
- **Rules:**
  - **SVG element colors** (`<Bar fill=...>`, `<Tooltip cursor={{ fill }}>`, `<LabelList style={{ fill }}>`, axis `tick`/`stroke`, `<CartesianGrid stroke>`): use **literal hex** (`#ef4444`, `#64748b`), **literal rgba** (`rgba(100, 116, 139, 0.12)`), or **`currentColor`** (inherits parent text color — adapts to light/dark automatically).
  - **Tooltip `contentStyle`** (a DOM inline style on a `<div>`): `hsl(var(--popover))` works — but prefer a **custom themed tooltip** (see below) for better control over text color and structure.

#### Custom Themed Tooltip Pattern

- Do NOT rely on Recharts' default `<Tooltip>` styling — its built-in text colors ignore the shadcn theme (dark text on dark background in dark mode) and it spams 0-value rows for stacked charts.
- Pass a custom tooltip component via `<Tooltip content={<CustomTooltip />} />`. Use Tailwind classes (`bg-popover text-popover-foreground border shadow-md`) so it inherits the shadcn theme.
- **Filter out zero-value entries** for stacked charts so the tooltip only shows segments that actually have data.
- **Include a total row** at the bottom for multi-segment charts — helps the user understand the bucket's magnitude.
- Reference implementations:
  - `src/components/reports/departed-students/departed-students-group-by-chart.tsx` → `GroupByTooltip`
  - `src/components/reports/departed-students/departed-students-dynamics-chart.tsx` → `DynamicsTooltip`

#### Color Palette for Categorical Data

- **Never use a rainbow palette with more than 4–5 distinct colors.** Stacked bars and grouped charts become unreadable past 4 hues, and colorblind accessibility degrades sharply.
- For categorical breakdowns (e.g. "top reasons"), use a **coordinated 3-color accent palette** + a neutral grey for "Boshqalar":
  - Top 1: `#f59e0b` (amber-500)
  - Top 2: `#8b5cf6` (violet-500)
  - Top 3: `#06b6d4` (cyan-500)
  - Boshqalar: `#94a3b8` (slate-400)
  - Sababi ko'rsatilmagan / null bucket: `#cbd5e1` (slate-300)
- For single-series charts (e.g. dynamics), pick **one semantic color**: red (`#ef4444`) for negative metrics (departures, errors), green for positive (revenue), primary for neutral.
- For **ranked bar lists**, use a heatmap-style scale: rank 1 = red, rank 2 = orange, rank 3 = amber, rest = primary tone. This lets the reader spot severity at a glance.

#### Data Aggregation: Top N + "Boshqalar"

- Every ranked breakdown chart **must collapse the long tail**. A chart with 20+ segments or 20+ rows is noise, not signal.
- Defaults used on `/reports/departed-students`:
  - `TOP_N_BUCKETS = 10` — max rows/columns in a chart
  - `TOP_N_REASONS = 3` — max segments in a stacked bar (additional segments merge into "Boshqalar")
- Label the collapsed row with the count: `"Boshqalar (${tail.length} ta ...)"` so the user knows how much is hidden.
- Collapsed rows must be **non-interactive** (disable click-through — there's no single entity to drill into).

#### Chart Card Title + Subtitle

- Every chart has a clear **title** and an informative **subtitle** that adds context at a glance:
  - Title: what the chart shows (e.g. `"Ketish dinamikasi"`, `"Ketish sabablari"`).
  - Subtitle: one-line summary with totals or the top finding (e.g. `"Jami 71 ta ketish — eng asosiy sabab: Moliyaviy qiyinchilik (31 ta)"`).
- Use the shared `<ChartCard title subtitle tooltip ...>` component at `src/components/reports/departed-students/chart-card.tsx` as the reference pattern. Copy it (or lift it to `src/components/shared/`) for new report pages.

#### Empty States Must Be Actionable

- Don't show bare `"Ma'lumot topilmadi"` — tell the user what to do next.
- Good examples:
  - `"Tanlangan davrda ketganlar yo'q — davrni kengaytirib ko'ring"`
  - `"Hali ma'lumot yo'q — birinchi guruhni yaratish uchun 'Yangi guruh' tugmasini bosing"`
- Skeleton/loading states use the same `<ChartCard isLoading>` flag — don't roll your own.

#### Click-Through Drill-Downs

- For any categorical chart with more than one segment per bar (stacked, grouped, ranked lists), bars/rows **must be clickable** and open a dialog listing the underlying students/rows.
- The dialog query must be scoped to the clicked segment (e.g. `departureReasonId=<id>`) AND inherit the page's existing filters (branch, course, date range).
- Non-interactive rows (like "Boshqalar" aggregate) must be `disabled` with a `cursor-not-allowed` style.

#### Bar List vs Recharts for Ranked Breakdowns

- For ranked breakdowns with long labels (Uzbek reason names, course names), a **custom HTML bar list** beats Recharts' horizontal `BarChart`:
  - Full labels visible (no axis-width truncation, no ellipsis)
  - Numbers and percents aligned inline, easy to scan
  - Better hover/focus states via `<button>` + Tailwind
  - Click-through drill-down is just an `onClick` on the button — no Recharts event plumbing
- Reference: `src/components/reports/departed-students/departed-students-reasons-chart.tsx`.
- Use Recharts when the chart actually benefits from its axes: time series (dynamics), stacked bars (group-by with segmentation), grouped bars.

#### Number Display in Bars

- `<LabelList>` inside a segment only makes sense if the segment is tall/wide enough to fit the text. Add a minimum-value guard in the formatter:
  ```tsx
  formatter={(v: unknown) => (typeof v === "number" && v >= 3 ? String(v) : "")}
  ```
- For stacked bars, also render a **top total label** on the last segment (`position="top"`) so the bucket's total is visible without hover — use `<LabelList dataKey="_total">` with a precomputed total field on each row.

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
- **Cross-entity history is mandatory** — when a change on one entity affects another, history must be recorded on **both** entities:
  - **Group history** must record every group-related change: teacher assigned/removed, schedule (time, days) updated, room changed, student added/removed/frozen/unfrozen/expelled/deleted. Any operation that affects a group's composition or configuration must appear in that group's "Tarix" tab
  - **Student history** must record every student-related change: enrolled to group, removed from group, status changed (manual or automatic), group completed, transferred between groups. Any operation that affects a student's enrollment or status must appear in that student's "Tarix" tab
  - This applies to **cascade operations** as well — if a student is frozen and their enrollment is frozen, the group must see "O'quvchi muzlatildi" in its history; if a group is completed and a student auto-graduates, the student must see "Avtomatik: guruh tugallanganligi sababli GRADUATED" in their history
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

### Branch Context in Forms (MANDATORY)

The system runs several branches, and a record written to the wrong one is wrong money. Two rules follow from `docs/branch-decisions.md`:

- **Take the branch from the ENTITY, not from the header switcher**, whenever the entity already has one. The switcher is a *viewing* filter; it is not a statement about the record being edited.
  - `enroll-to-group-dialog.tsx` takes a `studentBranchId` prop and lists only that branch's groups (falling back to the switcher only when the caller doesn't know it). Listing every branch's groups let an admin pick a foreign group — the backend now rejects it, but the option should never be offered.
  - `edit-group-form.tsx` sends `branchId` **on create only** (`isAdd`), never on edit. The same form serves both modes, and the two have opposite contracts: `POST /groups` **requires** `branchId` (`CreateGroupDto` validates `@IsInt()`, and the service resolves the branch, scopes the room and computes the group number from it), while `PATCH /groups/:id` **discards** it. Sending it on every save is what used to silently move a group — along with its students, lesson deductions and salary accruals — into whichever branch was being viewed; dropping it from both paths is what broke group creation with `"branchId must be an integer number"`. When the branch is missing on create, block the request with an Uzbek toast rather than letting the API reject it.
- **Branch is a required field wherever a record is born.** `convert-lead-dialog.tsx` marks Filial with `*` and disables the confirm button until one is chosen — "set it later" is not an option, because a branch-less student appears in no branch list and cannot take a payment. `add-student-dialog.tsx` already derives it from the active branch.

When a backend guard rejects a cross-branch action, surface the server's Uzbek message via `getErrorMessage` — it explains which branch each side belongs to.

### Student Filters

- **Single search field** for name, phone, and ID — placeholder: "Ism, telefon yoki ID bo'yicha..."
- Removed separate `id` filter and `groupLevel` filter — all search is now server-side via `?search=` param
- **Status options**: Barcha holatlar, Faol, Muzlatilgan, Guruhlashtirilmagan, Bitirgan, Chetlatilgan
- **Branch filtering**: automatically filters by selected branch (`selectedBranch?.id` → `?branch_id=`)
- Filter changes always reset pagination to page 1
- No client-side filtering — all filtering is done server-side for consistency and performance

### Comments & Task Assignment (Izohlar)

- **"Izohlar" tab** exists on: Student Profile, Teacher Profile — displays comment list + form
- **Shared components:**
  - `src/components/shared/comment-list.tsx` — comment list (regular + task), pagination, assignee status buttons
  - `src/components/shared/comment-form.tsx` — comment form, CEO/BD get "As task" switch + assignee selection
- **Task comments** are highlighted with a yellow border and show assignee badges
- **Assignee buttons:** "Ko'rdim" (SEEN) and "Bajarildi" (DONE) — only visible on comments assigned to the current user
- **Eslatma section** (student profile card): shows the latest comment from `GET /api/comments/latest`, fallback: `student.comment`
- Lazy loading pattern: comments are only fetched when the "Izohlar" tab is opened
- To add comments to a new entity detail page:
  ```tsx
  import { CommentList } from "@/components/shared/comment-list";
  import { CommentForm } from "@/components/shared/comment-form";
  <CommentForm entityType="Student" entityId={id} onCreated={handleRefresh} />
  <CommentList entityType="Student" entityId={id} refreshKey={key} />
  ```

### Financial UI (Moliya bo'limi)

The financial section lives under `/payments/*` with these sub-pages:

| Route | Component | Purpose |
|-------|-----------|---------|
| `/payments/overview` | `overview-client.tsx` → `PaymentsOverview` | Dashboard: KPI cards (income, expenses, profit, LTV, CAC, ROI), date range picker, recent payments. The "Tushum ko'rsatkichlari" card's first line is **Oy oxiriga kutilyapti** (`forecast.expectedMonthEnd`) — lesson value for the whole month, held-and-paid plus the remaining scheduled slots. It replaced "Prognoz (bashorat)", which assumed every month was four weeks and was rebuilt from the live roster on every request. Its tooltip breaks the figure into `expectedHeld` + `expectedRemaining`; do not relabel it as a cash forecast, and never compute a second one client-side. Clicking the row opens `expectation-history-dialog.tsx` — how that figure moved day by day this month, from the daily snapshot. **One line, not three:** held and collected climb from zero every month and carry no surprise, and plotting them forces a 0-based Y axis that flattens the expectation's few-percent movement into a straight edge — hiding the only thing the chart exists to show. They live in the tooltip instead. The Y domain is therefore data-derived, never zero-based. Notable steps (>0.3%) get a `ReferenceDot` plus a "Nima bo'ldi" row naming the cause; a step with no recorded event is left unexplained rather than guessed at. `connectNulls={false}` so a day nobody wrote reads as a gap. |
| `/payments/salary` | `salary-client.tsx` → `salary-monthly-view.tsx` | **Month-selectable per-teacher salary report** (`GET /salary/monthly`). Pick a month (floor = `systemStartDate`/May 2026) → all teachers, no pagination. Columns: To'liq ishlangan (full deserved) · O'quvchilar to'lagan (covered — students' money ONLY) · Markaz qo'shdi (centerFunded) · Avans · To'lanishi kerak (net) · Holat. Manual/Excel months (May) show `—` for the deserved/covered/centerFunded split. Display-only; rate config + cycle-day live in a separate ⚙ Sozlamalar sheet, approve/pay via the breakdown drawer. `/payments/salary/config` redirects here. |
| `/payments/expenses` | `expenses-client.tsx` | Expense list + create dialog |
| `/payments/debt` | `debt/debt-page-client.tsx` | **Qarzdorlik — one page for everything owed to the center.** Four URL-persisted tabs (`?tab=`): **Qarzdorlar** (the debtor list — every status including archived, with promise/status/sort filters and a "Qachondan beri" column), **Markaz qoplagani** (who the payroll top-up is owed by), **Oylik qarzdorlik** (the month-by-month roll-forward) and **Kechirilganlar** (write-offs). Filter state lives in one `DebtFiltersProvider`, not per-view. Payment promises are NOT a tab — a promise is a property of a debtor, already returned by `GET /payments/debtors`, so it is a column and a filter; `LogCallDialog` with the "To'laydi" outcome is the only way to create one. `/payments/debtors` redirects here. |
| `/payments/debt-history`, `/payments/debt-write-offs`, `/payments/debtors` | — | **Redirects** into `/payments/debt` (`?tab=oylik`, `?tab=kechirilgan`, default). Kept as redirects rather than deleted: the paths live in browser histories, bookmarks and Telegram messages. |

#### Key Components

- **`salary-monthly-view.tsx`** — the main `/payments/salary` table (`GET /salary/monthly?month=YYYY-MM&search=`, URL-persisted via `useUrlFilters`). A `MonthPicker` (with `minMonth` floor = response `floorMonth`, `maxMonth` = current month) drives the selected month; no pagination (every teacher renders). Columns: **To'liq ishlangan** (`fullDeserved`), **O'quvchilar to'lagan** (`covered`), **Markaz qo'shdi** (`centerFunded`, amber when >0), **Avans**, **To'lanishi kerak** (`netToPay`, semibold), **Holat** (SalaryPayment status badge). A `MoneyOrDash` helper renders `—` when `hasLessonData` is false (manual/Excel months like May); an amber banner explains such months. JAMI footer sums the columns (deserved/covered/centerFunded exclude manual months). Clicking a row with a payment opens `salary-breakdown-drawer`. **Display-only** — no rate editing / approve / pay in the rows. Below the table, a **"Markaz qo'shimchasi — undirish holati"** card shows the company-level center top-up lifecycle for the selected month — Jami qo'shdi (X) / Undirildi (Y) / Qolgan markaz (Z), from `totals.centerAdvanced/centerRecovered/centerStillFronted`. Rendered only when `centerAdvanced > 0` (past settled top-up months; hidden for the in-progress month where nothing has been fronted YET — that month's centre money lives in the per-teacher **Markaz qo'shdi** column as a forecast). The card is the recovery lifecycle, NOT a second copy of the column.
- **Markaz qo'shimchasi drill-down** — the salary page's card no longer opens a dialog: its two live figures («Qolgan (markaz)» and «O'quvchilardan olinishi kerak») are `<Link>`s to `/payments/debt?tab=markaz&month=…`, where the list lives as `debt/center-topup-content.tsx`. A dialog holding a second copy meant two places to keep in step and a list nobody could open in a new tab. The list shows exactly TWO money columns — **Markaz ustozga to'lagan** (the center's outlay) and **O'quvchining qarzi** (their debt today, the same figure as their profile). Two other versions of that second column were tried and removed: what the lessons cost (#10026 showed 345 000 against a real debt of 156 000) and `min(debt, lesson cost)` (#10058 showed 466 662 against a profile saying 624 989). An UNSETTLED month shows the forecast leg instead — lessons held that payroll has not paid for yet — labelled «Markaz to'laydi» over a banner, never merged into the paid figures.
- **`salary-settle-month-dialog.tsx`** — «Oylik berilganini tasdiqlash» (CEO-only button in the `/payments/salary` filter row, shown only when the selected month still carries unpaid payroll). Confirms salaries that were **handed over outside the system** at the amounts the system had already calculated. Reads `GET /salary/payments/settle-month/preview` — a dedicated endpoint, NOT the table, because the table shows one payment per employee while a re-calculated month carries several per person (June 2026: two rows for six teachers), and the dialog must list exactly what it settles. It asks for three things: the real handover **date** (`DatePicker`, `maxDate` today, `minDate` period start), **how much left each kassa account** of every branch in the batch — an amount per account, not one chosen account, because a payroll routinely goes out part cash and part card; each branch's amounts must close to its own total exactly, and each row shows a live "Hozir X → keyin Y" projection that warns in amber when an account goes negative but never blocks (the money really did leave) — and the **total retyped in digits**. Typing the sum is the confirmation rather than a random code: the total is the one number the operator has to have read, and the server re-checks it against the live set. **This dialog's table is deliberately NOT paginated** — a confirmation dialog that hides part of what it is confirming works against its own purpose.
- **`salary-settings-sheet.tsx`** — ⚙ Sozlamalar Sheet (CEO-only button in the filter row). Three sections: **Hisoblash davri** (embeds `salary-period-control.tsx`), **Ustoz stavkalari** (fetches `GET /salary/overview?pageSize=100`; per teacher a rate-badge row + pencil → `salary-config-row-sheet`, checkbox multi-select → `salary-config-bulk-dialog`) and **Xodimlar stavkalari** (`salary-staff-config-list.tsx` → `GET /salary/staff-config`). This is where rate rules + cycle-day are managed, kept OUT of the display report. `onChanged` bumps the report's refreshKey.
  - **One search box drives both lists** — "who is still missing a rate?" is a single question and must not depend on which list the person is in. Both rate editors are the SAME `SalaryConfigRowSheet`; the sheet holds the whole `EditTarget` (not a user id) because the two lists come from different endpoints. The staff rows pass their real `roles`, so `isTeacher` is false and the editor offers FIXED_MONTHLY alone — a staff member can never be given a per-lesson rate by accident.
  - **Why staff need their own list rather than a widened `/salary/overview`:** that endpoint computes groups, active students and `actualEarned` per teacher, all structurally 0 for a fixed-monthly administrator — rows that read "earned nothing" next to a full month's salary. It is also the reason the "Xodimlar oyligi" section of the report sat empty from July 2026 until this shipped: the report lists staff who HAVE a rate, and there was no screen on which to set one.
- **`salary-period-control.tsx`** — cycle-start-day control. Now embedded inside `salary-settings-sheet` (was previously at the top of the overview). Shows the current period range + day; CEO changes the day via a select → confirm `AlertDialog` → `POST /salary/period-settings`.
- **`salary-config-bulk-dialog.tsx`** + **`salary-config-row-sheet.tsx`** — CEO assigns salary rates: bulk dialog applies a rate to many selected teachers; row sheet edits one teacher's rules (select type FIXED_MONTHLY / PERCENTAGE / FIXED_PER_STUDENT → enter value → save). PERCENTAGE and FIXED_PER_STUDENT only shown for teachers (role id 4). Both are now invoked **inline** from `salary-overview-view` (the standalone config page was removed).
- **`possible-deductions-info.tsx`** — pure-static info card listing the deductions that may be applied outside the system. Takes a `variant` prop: `"teacher"` shows only "Ustoz oyligidan — 12%", `"all"` (default) shows all six items (Ustoz 12%, Markaz qo'shimchasi 12%, Markaz daromad 4%, Click/Payme/Uzum 2%). Rendered in: salary-breakdown-drawer (default `"all"` — part of the company-wide /payments/salary admin page), teacher-salary-client (lehrer portal, `"teacher"` — teacher viewing their own salary), teacher-profile-tabs and employee-profile-tabs (admin Ish haqi tab, `"teacher"` — view scoped to one teacher's salary). Has no state, no API calls, no calculations. Numbers are documentation, not configuration — not enforced by any code.
- **`record-payment-dialog.tsx`** — Manual payment entry: student select, amount, method, contract (optional), receipt number
- **`payments-overview.tsx`** — KPI cards fetching from `GET /reports/financial-overview`. Uses `staleTime: 0` to always show fresh data.

#### Financial UI Rules

- **Branch context**: All financial mutations (payment create, expense create) must send `branchId: selectedBranch?.id` from `useBranchSwitcher()`. Without it, records won't appear in branch-filtered reports.
- **Cache invalidation**: When creating/deleting expenses, call `queryClient.invalidateQueries({ queryKey: ["financial-overview"] })` to update the overview dashboard.
- **Financial data always refetches** — never use optimistic updates for balances, payments, or salary data. Always refetch from server after mutations.
- **Salary role labels**: `{ 1: "Direktor", 2: "Filial direktori", 3: "Administrator", 4: "O'qituvchi", 5: "Kassir" }`
- **Payment status labels**: `{ CALCULATED: "Hisoblangan", APPROVED: "Tasdiqlangan", PAID: "To'langan", CANCELLED: "Bekor qilingan", REVERSED: "Bekor qilingan" }`
- **Salary actions by role** (the `/payments/salary` report is display-only; actions are in the ⚙ Sozlamalar sheet or the breakdown drawer):
  - CEO: ⚙ Sozlamalar → edit a teacher's rate (pencil → row sheet), bulk-apply rates (checkbox → bulk dialog), change the cycle day (period control).
  - CEO + BD: approve/pay a single payment from the breakdown drawer footer.
  - Administrator: read-only (sees the report; no ⚙ button, no edit/pay).
- **No manual salary calculation** — the daily cron settles each completed cycle automatically (`POST /salary/calculate` is cron-internal; there is intentionally no "Oylikni hisoblash" button in the UI). Do not re-introduce a manual calculate dialog.
- **The report is month-selectable, not "live current cycle"** — pick a month; per teacher `fullDeserved` (all lessons held × rate), `covered` (students' money ONLY — accruals with `wasCenterTopUp` false), `centerFunded` (the centre's leg: top-up accruals already written PLUS lessons it still has to front), `advances`, `netToPay`. The split is computed identically for a settled and an in-progress month — settling one only moves money between `centerFunded`'s two terms. `netToPay` base is `fullDeserved` (covered + centerFunded) **since the July 2026 center-top-up**, gated per month by the backend `isTopUpMonth` (`TOPUP_EFFECTIVE_MONTH='2026-07'`); earlier months stay on the `covered` base. This is now **actually paid** (not display-only) — the salary cron's Phase 0 fronts the gap with center-funded accruals, so a top-up month's shown `netToPay` equals what the cron pays; already-settled months show their real settled amount. The breakdown drawer marks fronted lines with a "Markaz qo'shimchasi" badge + a "shundan markaz qo'shimchasi X" subtotal. Manual/Excel months (May) show `—` for deserved/covered/centerFunded (no per-lesson data). Do not re-introduce "Kutilayotgan"/"Real ishlangan" columns here.
- **No tax UI** — the system does not compute or apply taxes anywhere. Possible deductions (Ustoz 12%, Markaz qo'shimchasi 12%, Markaz daromad 4%, gateway 2%) are surfaced as a static info note via `possible-deductions-info.tsx` only. Do not re-introduce a tax config sheet or any "Soliqdan keyin" / "Brutto" / "Netto" columns in salary views.

### Salary Breakdown Drawer

- **`salary-breakdown-drawer.tsx`** — opens when CEO/BD/Admin clicks a teacher row that has a settled `SalaryPayment` in the `/payments/salary` overview. Shows what the payment is composed of: every accrual that fed into it, with student, lesson date, the rate config version that supplied the rule, and per-lesson cost. Its footer still drives the per-payment approve (CEO) / pay (CEO/BD) workflow.
- Layout follows the project's standard drawer skeleton: `SheetContent p-0 flex flex-col` → `SheetHeader border-b px-6 py-4` → scrollable body with sections (`px-6 py-5`) → `SheetFooter border-t px-6 py-4`.
- Summary card at the top: Amount (large, tabular-nums), period range, lessons/students stats. Followed by the per-lesson breakdown table and a `<PossibleDeductionsInfo />` note at the bottom listing possible deductions.
- Reversed accruals stay in the table (sorted in date order) but with `bg-amber-50/40`, opacity 60%, strikethrough amount, and a small `Bekor` badge with `RotateCcw` icon. Backend filters them out of payroll math (`reversedAt: null`) but they remain visible for audit.
- **Avans ushlandi box**: when the payment has settled TEACHER_ADVANCE expenses (`settledAdvancesTotal > 0`), an indigo box lists each advance (date · description · −amount) and shows the math `Hisoblangan oylik (avansdan oldin) − Avans ushlandi = Sof to'lov`. This makes the gap between earned and net-paid explicit — the advance was paid up front via Xarajatlar and netted out of this run. The `/payments/salary` overview shows "shundan avans X" under the "Jami berilgan" column. Per-teacher views (profile tab, profile card, lehrer portal) surface the advance as the "Avans" figure inside `salary-monthly-panel.tsx`, already netted out of "To'lanishi kerak" — see "One Salary Number Rule" below.
- CSV export (`Download` icon button) builds a UTF-8-with-BOM CSV (Excel-compatible) of every line.

### Lehrer Portal Salary Page

- **`/profile/salary`** (lehrer subdomain only) → `teacher-salary-client.tsx`. Backend uses `@CurrentUser('id')` so each teacher sees only their own data — no role check needed beyond authentication.
- Three sections: `<SalaryMonthlyPanel scope="me" />` (the month's real figures), per-group context table, current cycle accrual table, plus a `<PossibleDeductionsInfo />` note at the bottom.
- Sidebar nav item "Mening oyligim" with `visibleForRoles: [4]` so it appears only on the lehrer portal.
- Endpoints: `GET /salary/me/monthly` (the figures), `GET /salary/me/summary` (group context), `GET /salary/me/current-cycle/breakdown`.
- The page **must** stay wrapped in `<Suspense>` — the panel's month picker uses `useSearchParams`, which bails out of static prerendering without a boundary (this broke the build once).

### One Salary Number Rule (MANDATORY)

**`SalaryMonthlyService.getMonthly` is the only source of a teacher's salary figures.** Every screen that shows what a teacher earned or is owed renders a row from it — never its own calculation.

- Shared components: **`shared/salary-monthly-panel.tsx`** (month picker + To'liq ishlangan · O'quvchilar to'lagan · Markaz qo'shimchasi · Avans · To'lanishi kerak · Holat) and **`shared/salary-due-card.tsx`** (the current month's net "To'lanishi kerak" on a profile card).
- Consumers: teacher profile "Ish haqi" tab, employee profile "Ish haqi" tab, teacher/employee/own profile cards (desktop + `MobileProfileHeader`), and the lehrer portal.
- Endpoints: `GET /salary/monthly/user/:userId` (CEO/BD) and `GET /salary/me/monthly`.
- **Do NOT re-introduce a forecast.** The old `expectedMonthly` (active students × `exactDays.length * 4` lessons × rate) and the period-less "Haqiqiy yig'ilgan" accrual sum were removed precisely because one teacher ended up showing four different numbers. `GET /teachers/:id/salary-summary` now carries group CONTEXT only (name, active students, rate, course price) — no money.
- **Do NOT show `User.balance` as a staff salary figure.** It is a running ledger that only rises on accruals, falls only when a salary is marked PAID, and never subtracts advances already handed over. `MobileProfileHeader`'s `balance` prop is now for the **student** prepaid banner only; staff pass `salaryDueUserId` (+ `salaryDueScope="me"` on one's own profile).
- Parity guard: `server/scripts/verify-per-user-salary-parity.ts` compares every teacher's table row against their single-row response field by field.

### Lesson Changes Tab (Group Detail)

- **Tab "Dars o'zgarishlari"** (URL value `bekor-qilingan`) on `/groups/[id]` → `lesson-changes-tab.tsx`. Visible to CEO / BD / Administrator (`canManage` gate). Covers both cancellations and reschedules.
- Lists active cancellations for the group (date, reason, who cancelled, when).
- "Bu darsni bekor qilish" button (CEO/BD/Admin) opens a dialog with `DatePicker` + reason `Textarea`. Submission triggers atomic backend cascade — if any students were marked PRESENT for that day, their attendance is flipped to EXCUSED, prepaid restored, salary accruals reversed.
- Delete (`Trash2` icon, CEO/BD only) is **soft delete** — the confirm dialog explicitly warns: "Diqqat: bu davomat va to'lovni tiklamaydi. Agar dars haqiqatda o'tilgan bo'lsa, admin keyin davomatni qo'lda olishi kerak."
- Toast on success: "Bekor qilingan dars yozuvi o'chirildi" (NOT "tiklandi" — that wording was misleading and was fixed in the audit).
- Lazy-loaded: `cancellationsVisible` / `cancellationsShown` ref pattern in `group-detail-tabs.tsx`.

### Teacher Timeline Tab

- **Tab "Taymlayn"** on `/teachers/profile/[id]` → `teacher-timeline-tab.tsx`. Visible to CEO / BD / Administrator.
- Merged chronological feed of three streams from `GET /salary/timeline/:userId`: salary config version changes, group teacher history (added/removed/replaced), profile updates (EntityHistory).
- Each event renders with a kind-specific icon (CircleDollarSign / UserPlus / UserMinus / Users / PencilLine) and color, the actor name, and a localized summary string.

### Student Profile Tabs

The student profile (`/students/profile/[id]`) has **8 tabs** (URL `?tab=<value>`):

| Tab | URL value | Purpose |
|-----|-----------|---------|
| Guruhlar | `guruhlar` (default) | Enrollments list |
| To'lovlar | `tolovlar` | Money-flow transactions — see deep-dive below |
| Darslar | `darslar` | Lesson trail (LESSON_DEDUCTION + LESSON_CONSUMPTION) — see deep-dive below |
| Izohlar | `izohlar` | Comments + task assignment (shared `CommentList` / `CommentForm`) |
| Qo'ng'iroq | `qongiroq` | Call history |
| SMS | `sms` | SMS history |
| Tarix | `tarix` | Entity history (shared `EntityHistoryTable`) |
| Lid | `lid` | Lead/source info |

The two transaction tabs (**To'lovlar** and **Darslar**) are documented in depth below because they share an endpoint family and have a near-strict separation contract: every `Transaction` type belongs to exactly one tab — **except `LESSON_DEDUCTION`, which intentionally appears on both**. `LESSON_DEDUCTION` is a real money-flow row (it moves the balance), so it shows on "To'lovlar" to explain balance drops; it is also part of the lesson story, so it stays on "Darslar". `LESSON_CONSUMPTION` (amount=0) stays exclusive to "Darslar". Do not move any other type across tabs.

#### "To'lovlar" tab (`?tab=tolovlar`)

- Component: `student-payments-table.tsx`. Visible to CEO / BD / Administrator (`canManage`).
- Question it answers: **"Where did money flow in/out of the student's balance?"**
- Reads `GET /transactions/student/:id?types=PAYMENT,REFUND,ADJUSTMENT,INITIAL_BALANCE,BALANCE_WITHDRAWAL,LESSON_DEDUCTION&pageSize=20`. The `types` query param is required to scope the tab to balance-moving rows; without it the endpoint would return everything.
- Sort: DESC (newest first), limited to the latest 20 rows.
- Header: balance card, then a "Balans operatsiyalari" table.
- Type badges live in `student-profile-tabs-utils.ts` → `TRANSACTION_TYPE_INFO`. It maps every balance-moving type, including `LESSON_DEDUCTION` ("Darsga yechildi"). `LESSON_DEDUCTION` rows get a muted row background, render their `metadata` (`mode` → `LESSON_DEDUCTION_MODE_LABELS`, `lessonsCovered`, `perLessonCost`) in the "Tafsilot" column, and carry no receipt / no "Amal" action. **Never add `LESSON_CONSUMPTION` here** — it has no balance movement and belongs only on "Darslar".
- **"Amal" column** — a 3-dot dropdown with "Summani to'g'rilash" (`correct-payment-dialog.tsx`). Shown only on the original, still-active PAYMENT row (positive amount, `COMPLETED` status) for CEO / BD / Administrator. Non-CEO callers only see it within 72h of the payment (`CORRECTION_WINDOW_MS`); the backend re-checks. The dialog posts `POST /payments/:id/correct` (reverse + re-post). On success the tab refreshes transactions and shows the returned `studentBalance` until the parent student refetch lands.

#### "Darslar" tab (`?tab=darslar`)

- Component: `lesson-trail-tab.tsx`. Visible to CEO / BD / Administrator (`canManage`).
- Question it answers: **"Which lessons did the student consume and which prepaid batch covered them?"**
- Reads `GET /transactions/student/:id/lesson-trail?page=1&pageSize=20`. The endpoint itself filters to `LESSON_DEDUCTION` + `LESSON_CONSUMPTION` server-side — the frontend doesn't pass a `types` param.
- Sort: ASC (chronological story), paginated by 20 (selectable 10/20/30/40/50).
- LESSON_DEDUCTION rows show `lessonMode` from `metadata` ("To'liq tsikl (12 dars)" / "Qisman (6 dars)") + contract number.
- LESSON_CONSUMPTION rows show the lesson date + group/course from the joined attendance row.
- Reversed rows (`isReversal`) get an extra "Bekor" badge and 60% opacity. The pre-pagination tab name was `?tab=dars-hisob` — that URL no longer exists; old links fall back to the default tab.

### Initial Balance Dialog (Student Profile)

- **`initial-balance-dialog.tsx`** — accessed via student profile `To'lov ▼` dropdown → "Boshlang'ich balans". CEO-only menu item (`isCeo` gate); backend write is `@Roles('CEO')`.
- Used during transition from old finance systems to enter a student's outstanding balance. Backend partial unique index `(studentId) WHERE type='INITIAL_BALANCE' AND reversedAt IS NULL` enforces "exactly one per student" — second submit returns 400 with "Boshlang'ich balans bu o'quvchi uchun allaqachon kiritilgan".
- Form: amount (`PriceInput`, min 0) + optional note (`Input`, maxLength 500).

### Student Portal (`src/components/student-portal/`)

Student-facing portal at `student.dafzentrum.uz` — students can view their profile, schedule, attendance, and make payments. The portal is skinned with the **Lumio** design system (ported from the student-app), a playful "clay" look with Baloo 2 / Nunito fonts, applied via a scoped `.lumio` class + tokens.

**Lumio design system (`src/components/student-portal/lumio/`):**
- Self-contained primitive library (barrel: `lumio/index.ts`) mirroring the student-app's design components: `Button`, `Card`, `FeatureCard`, `IconTile`, `ListRow`, `Badge`, `StatChip`, `Avatar`, `ProgressBar`, `ProgressRing`, `SegmentedControl`, `Section`, `ThemeSegmented`, `EmptyState`, `Screen`/`ScreenHeader`/`StackHeader`, `FadeIn`, `Skeleton`, `Input`/`Field`, `BottomSheet`.
- **Theme control:** the portal uses `ThemeSegmented` in **both** places — labelled (`variant="full"`) on `/portal/settings`, icon-only (`variant="compact"`) in the desktop rail footer. Do not put the admin `components/theme-toggle.tsx` (lucide, cycle-through) inside `/portal/*`: one state driven by two interaction models is exactly what this replaced. `theme-toggle.tsx` itself stays — the admin sidebar, dashboard header, `/login`, `error.tsx` and `not-found.tsx` all use it.
- `Screen` takes `narrow` (`lg:max-w-[600px]`) for text-and-rows screens; the shell's 980px column leaves them stretched. `StackHeader`'s back chevron is mobile-only — desktop navigates from the rail, and `/portal/more` is not on it.
- **Always build portal screens from these primitives**, not raw shadcn — keeps the native-app look consistent. Accent tones live in `lumio/tones.ts` (`TILE_TONE`: coral / sky / teal / grape / amber / ink).
- Shell chrome: `lumio/bottom-nav.tsx` (floating pill, mobile/tablet) and `lumio/side-rail.tsx` (desktop left rail). Mobile has no top header — each screen renders its own `ScreenHeader`/`StackHeader` title. The `.lumio` scope + fonts are applied by the portal route layout (`app/(student-portal)/portal/layout.tsx`).

**Responsive shell (`student-portal-layout.tsx`):** mobile + tablet (`< lg`) get the native-app feel (centered column, floating bottom nav); desktop (`>= lg`) swaps to a persistent left side rail + wider column. Role-gates to Student (role id 6).

**Navigation** — single source of truth in `src/lib/student-nav-items.ts` (`studentNavItems`, keyed by `slot: tab | more | both`). Bottom nav shows `tab`/`both`; desktop rail shows `both`/`more`; the "Ko'proq" hub (`student-more-hub.tsx`) lists `more`. AI is the raised center coral FAB.

**Key screen components:**
- `student-home-page.tsx` — dashboard (greeting, stats, schedule)
- `student-payment-summary.tsx` — balance, payment methods, history
- `student-schedule-view.tsx` — weekly schedule
- `student-attendance-history.tsx` — attendance records
- `student-profile-page.tsx` — identity: photo, name (editable in place), read-only contact rows
- `student-settings-page.tsx` — app behaviour: theme + security, and a link across to Profile
- `student-name-dialog.tsx` / `student-password-dialog.tsx` — controlled (`open` / `onOpenChange`) edit dialogs
- `student-more-hub.tsx` — "Ko'proq" landing (secondary nav)
- `student-faq-page.tsx` / `student-about-page.tsx` — FAQ + about screens
- `student-logout-button.tsx` — logout action
- Shared data helpers: `student-portal/lib/queries.ts` + `lib/types.ts`
- Login uses a dedicated Lumio-skinned `app/(auth)/login/student-login-form.tsx`

**Profile vs Settings:** Profile = *who the student is* (photo, name, phone, login, telegram, branch). Settings = *how the app behaves* (theme, password). Every field is editable in exactly one place — do not add a second entry point for the same field. Remaining portal UX findings and the phase order: `docs/student-portal-ux-audit.md`.

#### Online Payment (Payme + Click Integration)

- **Component**: `student-payment-summary.tsx`
- **Flow**: Student selects payment method → enters amount → clicks "To'lash" → `POST /student-portal/payments/init` → backend returns `checkoutUrl` → `window.location.href` redirects to provider's checkout page
- **Payment methods**: Payme (active), Click (active), Uzum (coming soon — `available: false`)
- **Payme flow**: Backend generates base64-encoded checkout URL → redirects to `checkout.paycom.uz` → Paycom calls our JSON-RPC webhook
- **Click flow**: Backend generates redirect URL → redirects to `my.click.uz/services/pay?...` → Click calls our SHOP-API webhook (Prepare + Complete)
- **Key difference**: Payme sends amounts in tiyin (×100), Click sends amounts in so'm (as-is)
- **Quick amounts**: 100K, 200K, 300K, 400K, 500K, 600K, 700K so'm
- **Minimum**: 1,000 so'm
- **Loading state**: "To'lov sahifasiga o'tkazilmoqda..." spinner on button during redirect
- **Callback**: After payment, both providers redirect to `/payment/result`
- **Balance display**: Shows current balance (green if positive, red if negative/debt)
- **Payment history**: Fetched from `GET /student-portal/payments` — shows transaction list with amounts and timestamps
- **Payme reference docs (UZ)**: `docs/payme-uz/index.html` — 25-page Uzbek-language reference covering Merchant API, Subscribe API, checkout initialization (GET/POST), sandbox testing, error codes, and mobile integration; mirrors the official `developer.help.paycom.uz` structure

### Position vs role in the employee form

`edit-employee-form.tsx` asks for **Lavozim** (`position`, required, free text)
before it asks for **Tizim huquqi** (`roleIds`, optional). The job title is what
every list renders; the roles are only access.

- The **"Kirish ma'lumotlari"** section (login + password) is its own
  component, `employee-credentials-section.tsx`, rendered by
  `edit-employee-form.tsx` only when at least one role is selected
  (`hasRoles`). A role-less employee cannot sign in — the backend refuses a
  password for them — so showing the fields would only mislead. Do not make
  them unconditional.
- **That gate is only half the contract, and both halves are load-bearing.**
  `toggleRole` clears `login` and `password` on the form the moment the last
  role is removed, and `onSubmit` separately omits both fields from the
  payload whenever `roleIds` is empty. The payload gate is the half that
  actually guarantees the backend will accept the request — the server only
  refuses a request that *sends* credentials on a role-less account, so a
  refactor that dropped the payload gate while keeping the field-clearing
  would silently re-break "demote an administrator to a role-less cleaner"
  the next time someone left stale form state around. The field-clearing is
  what keeps the visible form honest in the meantime. Keep both.
- Password is required on create **only when a role is given**.
- Branch stays required for everyone except a CEO, role-less employees
  included: a branch-less employee appears in no branch list and on no payroll
  report.
- Render the label with `positionLabel(user)` from
  `components/payments/salary-utils.ts` — job title first, falling back to the
  role for employees created before the column existed. Do not read
  `user.roles` directly for a "Lavozim" column; a cleaner has none.
- Editing an existing employee pre-fills Lavozim from their role label, which
  is how the field gets backfilled without a script.

### Employee & Teacher Status (Faollik holati)

- Both employee (Settings → Xodimlar) and teacher forms expose a single `status` field with values `ACTIVE / INACTIVE / SUSPENDED / TERMINATED` (and `ARCHIVED` on soft delete). **Never** add a separate "Faol" toggle — the backend keeps `isActive` in sync with `status` automatically
- When a user's status is changed to anything other than `ACTIVE`, the backend automatically stops sending them lesson/attendance notifications (filter by `status + isActive + deletedAt` is enforced at the query level on the server)
- **Do not** try to cancel pending notifications from the frontend, and do not send secondary "you have been deactivated" notifications from the client — status changes are silent from the user's perspective and are visible only in the entity history
- Status dropdown labels must be in Uzbek: `Faol`, `Nofaol`, `Vaqtincha to'xtatilgan`, `Ishdan bo'shatilgan`. Use the same labels consistently across employee and teacher UIs

### Notifications (Bildirishnomalar)

- **NotificationBell** (`src/components/notifications/notification-bell.tsx`) — bell icon + badge + dropdown in navbar
- **Zustand store** (`src/hooks/use-notifications.ts`) — notifications, unreadCount, markRead, markAllRead
- **SSE hook** (`src/hooks/use-sse.ts`) — fetch-based SSE (with JWT Authorization header), auto-reconnect
- **Push hook** (`src/hooks/use-push-notifications.ts`) — service worker registration + push subscription
- **Service Worker** (`public/sw.js`) — push event handler, notification click → navigates to page
- **Real-time:** When a new notification arrives via SSE, badge count increments and it's added to the dropdown
- Notification click → navigates to the related entity page (based on relatedEntityType/Id)

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

### CLAUDE.md Language Policy

- **This file (CLAUDE.md) must be written entirely in English.** All section headings, descriptions, rules, and comments must use English only.
- Uzbek text is acceptable **only** when quoting exact UI strings, error messages, or placeholder text that appears in the application (e.g. `"Barcha holatlar"`, `"Saqlashda xatolik yuz berdi"`).
- When adding new sections or editing existing ones, always write in English.

## Available Skills

Skills are specialized knowledge modules that **must** be activated when working on related tasks. Before starting any task, identify which skills are relevant and invoke them.

### Slash Commands (`.claude/commands/`)

| Command | When to use |
|---------|-------------|
| `/deploy` | Deploy to Vercel + Railway + Auto-Merge |
| `/restart` | Restart dev servers |
| `/team-deploy` | Safe team deployment |
| `/team-merge` | Safe PR merge |

### Agent Skills (`.agents/skills/`)

| Skill | When to use |
|-------|-------------|
| `frontend-design` | UI design, layout, styling, color, spacing, responsive tasks |
| `web-design-guidelines` | Web design rules, accessibility, UX best practices |
| `vercel-react-best-practices` | React performance, rendering, async patterns, bundle optimization |
| `vercel-composition-patterns` | Compound components, state management, React 19 patterns |
| `shadcn` | shadcn/ui component usage, customization, theming |
| `documentation-writer` | Writing technical documentation |

### Document Skills (`.claude/skills/`)

Project-scoped Claude Code skills installed via the `npx skills` CLI. Use the Skill tool to invoke them.

| Skill | When to use |
|-------|-------------|
| `pdf` | Any task that touches PDF files — generating PDFs (e.g. receipts, invoices, reports), reading or extracting text/tables, merging/splitting, rotating pages, watermarking, filling forms, encryption/decryption, OCR on scanned PDFs |

**Always invoke the `pdf` skill before working on PDF code** — receipt templates (`server/src/receipts/pdf/`), any new PDF generation, or any task that reads/produces a `.pdf` file. The skill brings up-to-date references for `pdfmake`, `pypdf`, font embedding, table layouts, watermarks, and form filling so we don't reinvent patterns. To install or update: `npx skills add anthropics/skills@pdf -a claude-code -y`.

### Context7 Skills (auto-triggered)

| Skill | When to use |
|-------|-------------|
| `typescript-expert` | TypeScript type-level programming, performance, migration |
| `docker-expert` | Docker containerization, multi-stage builds |
| `prisma-client-api` | Prisma query, filter, CRUD operations (including frontend types) |

### Skill Usage Rule

**Identify and activate the relevant skill at the start of each task — this is mandatory, not optional:**

1. **Creating/modifying UI components** → `frontend-design` + `vercel-react-best-practices` + `shadcn`
2. **Component architecture / composition** → `vercel-composition-patterns`
3. **Layout, spacing, responsive design** → `web-design-guidelines` + `frontend-design`
4. **shadcn/ui components (Button, Dialog, Table, etc.)** → `shadcn`
5. **TypeScript errors or complex types** → `typescript-expert`
6. **Deploying** → `/deploy`
7. **Working with Prisma models (frontend types)** → `prisma-client-api`
8. **Working with Docker** → `docker-expert`
9. **Anything PDF-related** (generating receipts/invoices, reading/extracting from a `.pdf`, merging/splitting, watermarks, OCR, forms) → `pdf`. Mandatory before touching `server/src/receipts/pdf/` or any new PDF generation work.
