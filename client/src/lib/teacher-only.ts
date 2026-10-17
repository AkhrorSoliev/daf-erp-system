/**
 * A teacher who holds none of the management roles (CEO, Branch Director,
 * Administrator). Identity, not a capability: the groups page and the schedule
 * already decide «my groups only» this way, so every teacher-only screen
 * (landing page, header, breadcrumb) asks the same question.
 */
export function isTeacherOnly(roles: readonly { id: number }[] | undefined): boolean {
  if (!roles) return false;
  return roles.some((r) => r.id === 4) && !roles.some((r) => [1, 2, 3].includes(r.id));
}
