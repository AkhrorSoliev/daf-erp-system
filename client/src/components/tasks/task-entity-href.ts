import { GROUP_PAGE_ROLES, STUDENT_PROFILE_ROLES } from "@/lib/role-access";

// A comment, and so a task, is written on a Student, Group, Lead or User only
// (the server's COMMENTABLE_ENTITY_TYPES).
const ENTITY_ROUTES: Record<string, (id: string) => string> = {
  Student: (id) => `/students/profile/${id}`,
  User: (id) => `/settings/employees/${id}`,
  Group: (id) => `/groups/${id}`,
  // A lead has no page of its own: the leads board opens its drawer from `?lead=`.
  Lead: (id) => `/leads?lead=${id}`,
};

// Employee settings open to the CEO and a Branch Director only:
// SettingsLayoutShell sends an Administrator back to /settings.
const EMPLOYEE_SETTINGS_ROLES = [1, 2];

// Sahifani ocholmaydigan ko'ruvchiga havola berilmaydi: server o'sha
// sahifani rad etadi (o'qituvchiga o'quvchi profili, kassirga guruh).
const ENTITY_PAGE_ROLES: Record<string, number[]> = {
  Student: STUDENT_PROFILE_ROLES,
  Group: GROUP_PAGE_ROLES,
  User: EMPLOYEE_SETTINGS_ROLES,
};

/**
 * Where a task card's "… sahifasiga o'tish" link goes, or `null` when the
 * viewer has no page to open for that entity.
 */
export function taskEntityHref(
  entityType: string,
  entityId: string,
  roleIds: number[],
): string | null {
  const allowed = ENTITY_PAGE_ROLES[entityType];
  if (allowed && !roleIds.some((id) => allowed.includes(id))) return null;
  return ENTITY_ROUTES[entityType]?.(entityId) ?? null;
}
