@AGENTS.md

# DaF Sprachzentrum — ERP System (Frontend)

An ERP system for **DaF Sprachzentrum** language school. Manages branches, staff, teachers, and students across multiple roles.

> **Language:** The entire UI of this project is in **Uzbek** (O'zbek tili). All labels, placeholders, messages, and user-facing text must be written in Uzbek.

## Roles

- **CEO** — Full system access
- **Admin** — System administration
- **Director** — Branch-level management
- **Teacher** — Teaching and class management
- More roles may be added in the future

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

- Date-only display format: **dd.mm.yyyy** — e.g. `21.03.2026`
- Date + time display format: **dd.mm.yyyy, hh:mm:ss** — e.g. `21.03.2026, 14:05:30`
- Use the time variant only when the time component is meaningful in context (e.g. activity logs, audit trails, timestamps)
- Use `date-fns/format` with the pattern `dd.MM.yyyy` or `dd.MM.yyyy, HH:mm:ss`

#### Prices and Currency

- All monetary values must use **comma as thousands separator**: `000,000`
- Example: `450,000` (not `450000` or `450 000`)
- Currency suffix: **so'm**
- Negative balances: prefix with `-`, e.g. `-50,000 so'm`

### Tables and Pagination

- All data tables **must default to showing 10 rows per page**.
- Every table must include a **page size selector** allowing the user to choose from: **10, 20, 30, 40, 50** rows per page.
- Changing the page size must reset the current page back to 1.
- Display the total record count and current page / total pages in the pagination controls.
- Use `useState` for `page` and `pageSize` in the client wrapper component (not inside the table component itself).
- The table component only receives the already-paginated slice of data as a prop — it does not handle pagination logic internally.

### Code Organization

- Keep files small, focused, and maintainable
- Colocate related files (component + its types + its utils)
- Shared utilities go in `src/lib/`, shared components in `src/components/`
