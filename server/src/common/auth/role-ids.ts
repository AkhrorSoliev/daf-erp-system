/**
 * The fixed ids of the `Role` table (seeded, never renumbered). One copy for
 * the whole server: `tasks/task-policy.ts` re-exports it for its callers.
 */
export const ROLE_ID = {
  CEO: 1,
  BRANCH_DIRECTOR: 2,
  ADMINISTRATOR: 3,
  TEACHER: 4,
  CASHIER: 5,
  STUDENT: 6,
} as const;

/** The role names the `Role` table and the token carry. */
export const ROLE_NAME_BY_ID: Record<number, string> = {
  [ROLE_ID.CEO]: 'CEO',
  [ROLE_ID.BRANCH_DIRECTOR]: 'Branch Director',
  [ROLE_ID.ADMINISTRATOR]: 'Administrator',
  [ROLE_ID.TEACHER]: 'Teacher',
  [ROLE_ID.CASHIER]: 'Cashier',
  [ROLE_ID.STUDENT]: 'Student',
};
