# Components

UI component library, layout components, and feature components.

---

## Layout Components

### AppSidebar

**File:** `components/app-sidebar.tsx`

Main navigation sidebar with collapsible icon mode. Uses shadcn/ui `Sidebar` component.

Features:
- Logo/brand at the top
- Navigation items from `lib/nav-items.ts`
- Active state highlighting
- Collapsible to icon-only mode
- User footer at the bottom

### DashboardHeader

**File:** `components/dashboard-header.tsx`

Top header bar containing:
- Sidebar trigger (hamburger menu)
- Search input
- Notification bell
- Theme toggle (dark/light)
- Branch switcher

### SidebarUserFooter

**File:** `components/sidebar-user-footer.tsx`

Displays the logged-in user's avatar, name, and role. Dropdown menu with:
- Profile link
- Logout action

### BranchSwitcher

**File:** `components/branch-switcher.tsx`

Dropdown to switch between branches. Shows branches available to the current user.

### ThemeToggle

**File:** `components/theme-toggle.tsx`

Cycles between Light, Dark, and System themes using `next-themes`.

## Providers

### ThemeProvider

**File:** `components/providers/theme-provider.tsx`

Wraps the app with `next-themes` for dark/light mode support.

### AuthProvider

**File:** `components/providers/auth-provider.tsx`

Hydrates the Zustand auth store from cookies on initial mount.

## Base UI Components (shadcn/ui)

Located in `components/ui/`. All built on Radix UI primitives.

| Component | File | Description |
|-----------|------|-------------|
| Button | `button.tsx` | Variants: default, destructive, outline, secondary, ghost, link |
| Input | `input.tsx` | Text input with Tailwind styling |
| Label | `label.tsx` | Form label |
| Table | `table.tsx` | Full table with header, body, row, cell |
| Select | `select.tsx` | Dropdown select |
| DropdownMenu | `dropdown-menu.tsx` | Context/action menus |
| Sheet | `sheet.tsx` | Slide-out drawer panel |
| Tabs | `tabs.tsx` | Tab navigation |
| Badge | `badge.tsx` | Status/tag badges |
| Avatar | `avatar.tsx` | User avatar with fallback |
| Tooltip | `tooltip.tsx` | Hover tooltips |
| Skeleton | `skeleton.tsx` | Loading placeholder |
| Switch | `switch.tsx` | Toggle switch |
| Textarea | `textarea.tsx` | Multi-line text input |
| Collapsible | `collapsible.tsx` | Expandable sections |
| Sidebar | `sidebar.tsx` | Full sidebar system with trigger, content, groups |

### Custom Input Components

#### PhoneInput

**File:** `components/ui/phone-input.tsx`

Auto-formats phone numbers with `+998` prefix:
- Accepts 9 digits
- Displays as `+998 XX XXX XX XX`
- Stores raw 9-digit string

#### PriceInput

**File:** `components/ui/price-input.tsx`

Auto-formats prices with comma separators:
- Displays as `1,500,000`
- Stores raw integer value
- Suffix: `so'm`

## Feature Components

Each feature area has its own folder under `components/`:

### Students (`components/students/`)

| Component | Description |
|-----------|-------------|
| `students-client.tsx` | List container with filters and pagination |
| `students-table.tsx` | Data table display |
| `student-detail-client.tsx` | Profile view |
| `student-profile-card.tsx` | Student profile info card |
| `student-profile-tabs.tsx` | Tabs (groups, comments, history) |
| `student-row-actions.tsx` | Row action dropdown |
| `enroll-to-group-dialog.tsx` | Enroll student to group dialog |
| `edit-student-drawer.tsx` | Edit form in a side sheet |
| `students-filter-bar.tsx` | Search + status filters |

### Teachers (`components/teachers/`)

| Component | Description |
|-----------|-------------|
| `teachers-client.tsx` | List container |
| `teachers-table.tsx` | Data table (includes studentCount column) |
| `edit-teacher-form.tsx` | Edit form |
| `teacher-profile-card.tsx` | Teacher profile info card |
| `teacher-profile-client.tsx` | Teacher detail page |
| `teacher-row-actions.tsx` | Row action dropdown |

### Groups (`components/groups/`)

| Component | Description |
|-----------|-------------|
| `groups-client.tsx` | List container |
| `groups-table.tsx` | Data table |
| `group-detail-client.tsx` | Group detail view |
| `group-detail-tabs.tsx` | Tabs (info, students, comments, history) |
| `group-info-card.tsx` | Group information card |
| `edit-group-form.tsx` | Group create/edit form with schedule availability |

### Tasks (`components/tasks/`)

| Component | Description |
|-----------|-------------|
| `tasks-board-client.tsx` | Task board container |
| Task board components | Kanban-style task management |

### Notifications (`components/notifications/`)

| Component | Description |
|-----------|-------------|
| `notification-bell.tsx` | Navbar bell icon with badge + dropdown |

### Shared (`components/shared/`)

| Component | Description |
|-----------|-------------|
| `comment-list.tsx` | Reusable comment list (comments + tasks) |
| `comment-form.tsx` | Comment/task creation form |
| `entity-history-table.tsx` | Reusable entity change history table |

### Leads (`components/leads/`)

| Component | Description |
|-----------|-------------|
| `leads-client.tsx` | Kanban board view |
| `leads-board.tsx` | Drag-and-drop board |

### Settings (`components/settings/`)

| Component | Description |
|-----------|-------------|
| `settings-layout-shell.tsx` | Settings page sidebar layout |
| `courses-settings-client.tsx` | Course management |
| `branches-settings-client.tsx` | Branch management |
| `rooms-settings-client.tsx` | Room management |
| `holidays-settings-client.tsx` | Holiday management |
| `employees-settings-client.tsx` | Employee management |
| `general-settings-client.tsx` | Company settings (CEO only) |
| `archive-settings-client.tsx` | Archived items |
| `left-students-settings-client.tsx` | Students who left |

## Component Conventions

- **Server Components** by default — only add `"use client"` when interactivity is needed
- Keep components under 300 lines (500 max)
- Feature-specific components go in `components/<feature>/`
- Shared UI components go in `components/ui/`
- All user-facing text is in Uzbek
