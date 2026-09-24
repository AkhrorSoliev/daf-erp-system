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
 * Whether the caller may change this employee's role set at all. The backend
 * refuses any change unless every role the employee holds is inside the
 * caller's ceiling, so a non-CEO can never reshape their own roles, a peer's
 * or a superior's. A new employee holds none and is always changeable.
 */
export function mayChangeRoles(
  grantableRoleIds: readonly number[],
  heldRoleIds: readonly number[],
): boolean {
  return heldRoleIds.every((id) => grantableRoleIds.includes(id));
}
