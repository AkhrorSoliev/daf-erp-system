/**
 * Which roles the signed-in user may hand out — the client half of the role
 * ceiling (ADR-0026). The backend enforces it on both doors that let a caller
 * choose roles: the employee form (`POST /users`, `PATCH /users/:id`) and the
 * Telegram registration link. The UI reads the same rule only so it never
 * offers what the server would refuse.
 *
 * Keyed by role NAME, like its server twin `GRANTABLE_ROLE_IDS`
 * (`server/src/telegram/constants.ts`); a test compares the two.
 */
export const GRANTABLE_BY_ROLE: Record<string, readonly number[]> = {
  CEO: [1, 2, 3, 4, 5],
  "Branch Director": [3, 4, 5],
  Administrator: [4, 5],
};

/**
 * The most senior of CEO, Branch Director and Administrator decides. Holding
 * none of them means nothing is grantable, never a default row.
 */
export function grantableRoleIdsFor(
  roleNames: readonly string[],
): readonly number[] {
  for (const key of ["CEO", "Branch Director", "Administrator"]) {
    if (roleNames.includes(key)) return GRANTABLE_BY_ROLE[key];
  }
  return [];
}

/**
 * What the employee form's "Tizim huquqi" field shows, for a caller holding
 * `callerRoleNames` and an employee holding `heldRoleIds` (none when new):
 *
 * - `pick`: toggles for exactly the roles the caller may grant.
 * - `read-only`: the employee holds a role outside the ceiling (a non-CEO's
 *   own record included). The backend refuses any change to such a role set,
 *   so the roles are listed and the form sends `roleIds` back unchanged.
 * - `hidden`: the caller may grant nothing and there is nothing to list.
 */
export type RoleField =
  | { mode: "pick"; roleIds: readonly number[] }
  | { mode: "read-only"; roleIds: readonly number[] }
  | { mode: "hidden" };

export function roleFieldFor(
  callerRoleNames: readonly string[],
  heldRoleIds: readonly number[],
): RoleField {
  const grantable = grantableRoleIdsFor(callerRoleNames);
  if (!heldRoleIds.every((id) => grantable.includes(id))) {
    return { mode: "read-only", roleIds: heldRoleIds };
  }
  if (grantable.length === 0) return { mode: "hidden" };
  return { mode: "pick", roleIds: grantable };
}
