import { roleLabel } from "@/components/payments/salary-utils";

const CEO_ROLE_ID = 1;

/**
 * The signed-in user's roles with the title the screen shows. The role name in
 * the database is English («Teacher»); the profile card shows the Uzbek one.
 */
export function uzbekRoles<T extends { id: number }>(
  roles: readonly T[],
): Array<{ id: number; name: string }> {
  return roles.map((r) => ({ id: r.id, name: roleLabel([r]) }));
}

/**
 * Whether the profile has a «To'lanishi kerak» figure to show. Only the
 * Director (CEO) has no salary: drawing the block for them prints a bare «—».
 * Everyone else, an administrator without a rate included, keeps the block.
 */
export function hasOwnSalary(roles: readonly { id: number }[]): boolean {
  return roles.some((r) => r.id !== CEO_ROLE_ID);
}
