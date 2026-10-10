import { describe, expect, it } from "vitest";
import { notificationHref } from "./notification-href";

const CEO = [1];
const BRANCH_DIRECTOR = [2];
const ADMINISTRATOR = [3];
const TEACHER = [4];

const task = (relatedEntityType: string, relatedEntityId: string) => ({
  type: "TASK_ASSIGNED" as const,
  relatedEntityType,
  relatedEntityId,
});

describe("notificationHref", () => {
  it("opens the student's profile, not the missing /students/<id>", () => {
    expect(notificationHref(task("Student", "10001"), ADMINISTRATOR)).toBe(
      "/students/profile/10001",
    );
  });

  it("opens the group page, which was not mapped at all", () => {
    expect(notificationHref(task("Group", "g1"), TEACHER)).toBe("/groups/g1");
  });

  it("opens a task's lead in the leads board drawer", () => {
    expect(notificationHref(task("Lead", "c1a2b3"), ADMINISTRATOR)).toBe(
      "/leads?lead=c1a2b3",
    );
  });

  it("sends a teacher's carried-over salary to their own salary page, not /teachers/<id>", () => {
    expect(
      notificationHref(
        { type: "SYSTEM", relatedEntityType: "User", relatedEntityId: "10407" },
        TEACHER,
      ),
    ).toBe("/profile/salary");
  });

  it("opens a task's employee in settings for the CEO and a Branch Director only", () => {
    expect(notificationHref(task("User", "10407"), CEO)).toBe(
      "/settings/employees/10407",
    );
    expect(notificationHref(task("User", "10407"), BRANCH_DIRECTOR)).toBe(
      "/settings/employees/10407",
    );
    expect(notificationHref(task("User", "10407"), ADMINISTRATOR)).toBeNull();
  });

  it("opens the auto-pause settings for an auto-pause alert", () => {
    expect(
      notificationHref(
        {
          type: "SYSTEM",
          relatedEntityType: "AbsencePauseSetting",
          relatedEntityId: "1",
        },
        CEO,
      ),
    ).toBe("/settings/absence-pause");
  });

  it("opens the debt page on broken promises for the 09:00 list", () => {
    expect(
      notificationHref(
        {
          type: "PAYMENT_PROMISE_OVERDUE",
          relatedEntityType: "BrokenPromises",
          relatedEntityId: "2",
        },
        ADMINISTRATOR,
      ),
    ).toBe("/payments/debt?promise=broken");
  });

  // Server bu sahifalarni shu rollarga bermaydi: GET /students/:id da
  // o'qituvchi, GET /groups/:id da kassir yo'q (src/lib/role-access.ts).
  it("gives a teacher-only viewer no student link and a cashier-only viewer no group link", () => {
    expect(notificationHref(task("Student", "10001"), TEACHER)).toBeNull();
    expect(notificationHref(task("Group", "g1"), [5])).toBeNull();
    expect(notificationHref(task("Group", "g1"), [5, 4])).toBe("/groups/g1");
  });

  it("goes nowhere without an entity or for an unknown one", () => {
    expect(
      notificationHref(
        { type: "SYSTEM", relatedEntityType: null, relatedEntityId: null },
        CEO,
      ),
    ).toBeNull();
    expect(notificationHref(task("Branch", "1001"), CEO)).toBeNull();
  });

  it("a task notification opens the task drawer", () => {
    expect(notificationHref({ type: "TASK_ASSIGNED", relatedEntityType: "Task", relatedEntityId: "t1" }, [4])).toBe("/tasks?task=t1");
    expect(notificationHref({ type: "TASK_REVIEW", relatedEntityType: "Task", relatedEntityId: "t1" }, [3])).toBe("/tasks?task=t1");
  });
});
