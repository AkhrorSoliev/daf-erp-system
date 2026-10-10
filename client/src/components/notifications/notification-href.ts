import type { AppNotification } from "@/hooks/use-notifications";
import type { Can } from "@/lib/permission-check";
import type { PermissionKey } from "@/lib/permission-keys";
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
  // The 09:00 list of one branch's broken payment promises (id = branch).
  BrokenPromises: () => "/payments/debt?promise=broken",
};

// A viewer who cannot open the page gets no link: the server refuses that page
// (a teacher the student profile, a cashier the group page).
const ENTITY_PAGE_PERMISSION: Record<string, PermissionKey> = {
  Student: "students.profile",
  Group: "groups.view",
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
  can: Can,
): string | null {
  const { type, relatedEntityType, relatedEntityId } = notification;
  if (!relatedEntityType || !relatedEntityId) return null;
  if (relatedEntityType === "User") {
    // The one SYSTEM notification on a User is a teacher's salary carried over
    // from a closed month, sent to that teacher.
    if (type === "SYSTEM") return "/profile/salary";
    // Otherwise it is a task on an employee.
    if (!canOpenEmployeeSettings(can)) return null;
  }
  const needed = ENTITY_PAGE_PERMISSION[relatedEntityType];
  if (needed && !can(needed)) return null;
  return ENTITY_ROUTES[relatedEntityType]?.(relatedEntityId) ?? null;
}
