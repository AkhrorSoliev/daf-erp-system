# Client Architecture

Next.js 16 frontend structure, pages, routing, and conventions.

---

## Tech Stack

| Technology | Version | Purpose |
|-----------|---------|---------|
| Next.js | 16.2.0 | React framework with App Router |
| React | 19.2.4 | UI library |
| TypeScript | 5 | Type safety |
| Tailwind CSS | 4 | Utility-first styling |
| shadcn/ui | — | Pre-built UI components (Radix-based) |
| Zustand | 5.0.12 | Client state management |
| TanStack Query | 5.91.2 | Server state & caching |
| Axios | 1.13.6 | HTTP client |
| react-hook-form | 7.71.2 | Form handling |
| Zod | 4.3.6 | Schema validation |
| date-fns | — | Date formatting |
| js-cookie | — | Cookie management |

## Project Structure

```
client/src/
├── app/
│   ├── layout.tsx                         # Root layout (providers)
│   ├── (auth)/
│   │   └── login/
│   │       ├── page.tsx                   # Login page
│   │       ├── login-form.tsx             # Login form component
│   │       └── login-footer.tsx           # Footer
│   └── (dashboard)/
│       ├── layout.tsx                     # Dashboard layout (sidebar + header)
│       ├── page.tsx                       # Home / Dashboard
│       ├── students/
│       │   ├── page.tsx                   # Students list
│       │   └── profile/[id]/page.tsx      # Student detail
│       ├── teachers/
│       │   ├── page.tsx
│       │   └── profile/[id]/page.tsx
│       ├── groups/
│       │   ├── page.tsx
│       │   └── [id]/page.tsx
│       ├── leads/page.tsx
│       ├── tasks/page.tsx                    # Tasks board
│       ├── schedule/page.tsx
│       ├── payments/page.tsx
│       ├── reports/page.tsx
│       └── settings/
│           ├── layout.tsx                 # Settings sidebar
│           ├── page.tsx                   # Redirects to /settings/courses
│           ├── general/page.tsx           # CEO only
│           ├── courses/
│           │   ├── page.tsx
│           │   └── [id]/page.tsx
│           ├── branches/
│           │   ├── page.tsx               # CEO only
│           │   └── [id]/page.tsx
│           ├── rooms/page.tsx
│           ├── employees/page.tsx         # CEO only
│           ├── holidays/page.tsx
│           ├── archive/page.tsx
│           └── left-students/page.tsx
│
├── components/
│   ├── ui/                                # shadcn/ui base components
│   ├── providers/                         # Context providers
│   ├── students/                          # Student-specific components
│   ├── teachers/                          # Teacher-specific components
│   ├── groups/                            # Group-specific components
│   ├── leads/                             # Lead-specific components
│   ├── tasks/                             # Task board components
│   ├── notifications/                     # Notification bell & dropdown
│   ├── shared/                            # Reusable (CommentList, CommentForm, EntityHistoryTable)
│   ├── settings/                          # Settings-specific components
│   ├── app-sidebar.tsx                    # Main navigation
│   ├── dashboard-header.tsx               # Top header bar
│   ├── branch-switcher.tsx                # Branch selection
│   ├── sidebar-user-footer.tsx            # User menu + logout
│   └── theme-toggle.tsx                   # Dark/light mode
│
├── hooks/                                 # Custom React hooks (Zustand stores)
├── lib/                                   # Utilities, API client, configs
├── data/                                  # Mock data (temporary)
└── middleware.ts                           # Auth route protection
```

## Routing

### Route Groups

- `(auth)` — Authentication pages (login). No sidebar/header.
- `(dashboard)` — All authenticated pages. Has sidebar + header layout.

### Page Pattern

Pages are **Server Components** by default. Interactive logic lives in separate Client Components:

```
page.tsx              → Server Component (static shell)
<feature>-client.tsx  → Client Component ("use client")
```

Example:

```typescript
// app/(dashboard)/students/page.tsx (Server Component)
import { StudentsClient } from '@/components/students/students-client';

export default function StudentsPage() {
  return <StudentsClient />;
}
```

## Navigation

### Main Navigation

Defined in `lib/nav-items.ts`:

| Route | Label (Uzbek) |
|-------|---------------|
| `/` | Bosh sahifa |
| `/teachers` | O'qituvchilar |
| `/students` | O'quvchilar |
| `/leads` | Lidlar |
| `/groups` | Guruhlar |
| `/tasks` | Topshiriqlar |
| `/schedule` | Dars jadvali |
| `/payments` | To'lovlar |
| `/reports` | Hisobotlar |
| `/settings` | Sozlamalar |

### Settings Navigation

Defined in `lib/settings-nav.ts`:

**Administration:**
- Courses, Rooms, Holidays, Archive, Left Students

**CEO Only:**
- General Settings, Employees, Branches

### Active State Detection

```typescript
// Exact match for home
pathname === "/"

// Prefix match for everything else
pathname.startsWith(item.url)
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_API_URL` | Backend API base URL (e.g. `http://localhost:4000/api`) |

## UI Language

All user-facing text is in **Uzbek (O'zbek tili)**. Labels, placeholders, validation messages, navigation items — everything is in Uzbek.
