import type { AppNotification } from "@/hooks/use-notifications";
import { GROUP_PAGE_ROLES, STUDENT_PROFILE_ROLES } from "@/lib/role-access";
import { canOpenEmployeeSettings } from "@/lib/settings-nav";

// What the server points a notification at: a Group (attendance, lesson
// changes), a Student (payments, auto-pause), AbsencePauseSetting (an alert to
// the CEO), or for a task whatever its comment was written on.
const ENTITY_ROUTES: Record<string, (id: string) => string> = {
  Student: (id) => `/students/profile/${id}`,
  Group: (id) => `/groups/${id}`,
  // A lead has no page of its own: the leads board opens its drawer from `?lead=`.
  Lead: (id) => `/leads?lead=${id}`,
  User: (id) => `/settings/employees/${id}`,
  AbsencePauseSetting: () => "/settings/absence-pause",
  Task: (id) => `/tasks?task=${id}`,
};

// Sahifani ocholmaydigan ko'ruvchiga havola berilmaydi: server o'sha
// sahifani rad etadi (o'qituvchiga o'quvchi profili, kassirga guruh).
const ENTITY_PAGE_ROLES: Record<string, number[]> = {
  Student: STUDENT_PROFILE_ROLES,
  Group: GROUP_PAGE_ROLES,
};

/**
 * Where a click on a notification goes, or `null` when the viewer has no page
 * to open for it.
 */
export function notificationHref(
  notification: Pick<
    AppNotification,
    "type" | "relatedEntityType" | "relatedEntityId"
  >,
  roleIds: number[],
): string | null {
  const { type, relatedEntityType, relatedEntityId } = notification;
  if (!relatedEntityType || !relatedEntityId) return null;
  if (relatedEntityType === "User") {
    // The one SYSTEM notification on a User is a teacher's salary carried over
    // from a closed month, sent to that teacher.
    if (type === "SYSTEM") return "/profile/salary";
    // Otherwise it is a task on an employee.
    if (!canOpenEmployeeSettings(roleIds)) return null;
  }
  const allowed = ENTITY_PAGE_ROLES[relatedEntityType];
  if (allowed && !roleIds.some((id) => allowed.includes(id))) return null;
  return ENTITY_ROUTES[relatedEntityType]?.(relatedEntityId) ?? null;
}
