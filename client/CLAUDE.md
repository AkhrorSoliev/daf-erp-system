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

#### Prices and Currency

- All monetary values must use **comma as thousands separator**: `000,000`
- Example: `450,000` (not `450000` or `450 000`)
- Currency suffix: **so'm**
- Negative balances: prefix with `-`, e.g. `-50,000 so'm`

### Code Organization

- Keep files small, focused, and maintainable
- Colocate related files (component + its types + its utils)
- Shared utilities go in `src/lib/`, shared components in `src/components/`
