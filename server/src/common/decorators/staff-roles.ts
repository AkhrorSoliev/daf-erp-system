/**
 * Every role EXCEPT Student.
 *
 * Several list endpoints (`/students`, `/branches`, `/rooms`, `/courses`,
 * `/dashboard/today-schedule`) carried no `@Roles()` at all. The global
 * `JwtAuthGuard` only proves the caller is logged in — and a student portal
 * token is a perfectly valid login. `GET /students` returns `studentSelect`,
 * which includes phone, parent phone, address, passport series and balance, so
 * any student could pull the centre's entire PII database.
 *
 * These endpoints genuinely need a wide audience — the dashboard is visible to
 * teachers, the payment dialog to cashiers, group screens to everyone on staff —
 * so the fix is not a narrow whitelist but an explicit "staff only" ceiling.
 * Students read their own data through `student-portal.controller.ts`.
 *
 * Spread it into the decorator: `@Roles(...STAFF_ROLES)`.
 */
export const STAFF_ROLES = [
  'CEO',
  'Branch Director',
  'Administrator',
  'Teacher',
  'Cashier',
] as const;
