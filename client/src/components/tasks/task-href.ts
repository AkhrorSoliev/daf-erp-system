import type { Can } from "@/lib/permission-check";
import type { PermissionKey } from "@/lib/permission-keys";

// A comment, and so a task, is written on a Student, Group, Lead or User only
// (the server's COMMENTABLE_ENTITY_TYPES).
const ENTITY_ROUTES: Record<string, (id: string) => string> = {
  Student: (id) => `/students/profile/${id}`,
  User: (id) => `/settings/employees/${id}`,
  Group: (id) => `/groups/${id}`,
  // A lead has no page of its own: the leads board opens its drawer from `?lead=`.
  Lead: (id) => `/leads?lead=${id}`,
};

// A viewer who cannot open the page gets no link: the server refuses that page
// (a teacher the student profile, a cashier the group page) and
// SettingsLayoutShell sends an Administrator back from employee settings.
const ENTITY_PAGE_PERMISSION: Record<string, PermissionKey> = {
  Student: "students.profile",
  Group: "groups.view",
  User: "employees.view",
};

/**
 * Where a task card's "… sahifasiga o'tish" link goes, or `null` when the
 * viewer has no page to open for that entity.
 */
export function taskEntityHref(
  entityType: string,
  entityId: string,
  can: Can,
): string | null {
  const needed = ENTITY_PAGE_PERMISSION[entityType];
  if (needed && !can(needed)) return null;
  return ENTITY_ROUTES[entityType]?.(entityId) ?? null;
}

export const taskHref = (id: string) => `/tasks?task=${id}`;
