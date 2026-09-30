import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { notificationHref } from "./notification-href";

const ID = "10001";
const VIEWER_ID = 10050;

// Havola haqiqiy sahifaga olib boradimi: `/students/profile/10001` →
// `app/(dashboard)/students/profile/[id]/page.tsx`. Eski xato aynan shu edi —
// `/students/10001` sahifasi yo'q.
function pageExists(href: string): boolean {
  const segments = href
    .split("/")
    .filter(Boolean)
    .map((segment) => (segment === ID ? "[id]" : segment));
  return existsSync(
    join(__dirname, "..", "app", "(dashboard)", ...segments, "page.tsx"),
  );
}

function notification(
  type: string,
  relatedEntityType: string | null,
  relatedEntityId: string | null = ID,
) {
  return { type, relatedEntityType, relatedEntityId };
}

describe("notificationHref", () => {
  it.each([
    ["Group: attendance reminder", notification("LESSON_STARTED", "Group"), `/groups/${ID}`],
    ["Student: payment corrected", notification("SYSTEM", "Student"), `/students/profile/${ID}`],
    [
      "User about the viewer: salary carried over",
      notification("SYSTEM", "User", String(VIEWER_ID)),
      "/profile/salary",
    ],
    [
      "AbsencePauseSetting: daily cap alert",
      notification("SYSTEM", "AbsencePauseSetting", "1"),
      "/settings/absence-pause",
    ],
    ["task on a student", notification("TASK_ASSIGNED", "Student"), "/tasks"],
    ["task reminder on a lead", notification("TASK_REMINDER", "Lead"), "/tasks"],
    ["task on an employee", notification("TASK_UPDATED", "User"), "/tasks"],
  ])("%s opens an existing page", (_case, n, href) => {
    expect(notificationHref(n, VIEWER_ID)).toBe(href);
    expect(pageExists(href)).toBe(true);
  });

  it("opens nothing when no page fits every viewer", () => {
    // Topshiriqdan tashqari bunday xabar yo'q; xodim sahifasi
    // administratorni `/settings` ga qaytaradi.
    expect(notificationHref(notification("SYSTEM", "User"), VIEWER_ID)).toBeNull();
    expect(notificationHref(notification("SYSTEM", "Lead"), VIEWER_ID)).toBeNull();
    expect(notificationHref(notification("SYSTEM", "Branch"), VIEWER_ID)).toBeNull();
    expect(notificationHref(notification("SYSTEM", null, null), VIEWER_ID)).toBeNull();
  });
});
