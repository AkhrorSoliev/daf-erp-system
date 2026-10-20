import { roleLabel } from "@/components/payments/salary-utils";

const CEO_ROLE_ID = 1;

/**
 * One role's title in the page language. A role the client does not know is
 * data and is shown under its database name, never through `t`.
 * `grant` is for controls that GIVE a role: there the CEO reads «Direktor (CEO)»,
 * so nobody mistakes it for the Branch Director and grants full rights.
 */
export function roleTitle(
  role: { id: number; name?: string },
  t: (source: string) => string = (source) => source,
  options: { grant?: boolean } = {},
): string {
  if (options.grant && role.id === CEO_ROLE_ID) return t("Direktor (CEO)");
  const label = roleLabel([role]);
  return label === "—" ? (role.name ?? label) : t(label);
}

/**
 * Whether the profile has a «To'lanishi kerak» figure to show. Only the
 * Director (CEO) has no salary: drawing the block for them prints a bare «—».
 * Everyone else, an administrator without a rate included, keeps the block.
 */
export function hasOwnSalary(roles: readonly { id: number }[]): boolean {
  return roles.some((r) => r.id !== CEO_ROLE_ID);
}
