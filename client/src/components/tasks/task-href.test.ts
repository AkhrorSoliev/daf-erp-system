import { describe, expect, it } from "vitest";
import { canForRoles } from "@/test-support/server-catalog";
import { taskEntityHref, taskHref } from "./task-href";

const CEO = canForRoles([1]);
const BRANCH_DIRECTOR = canForRoles([2]);
const ADMINISTRATOR = canForRoles([3]);

describe("taskEntityHref", () => {
  it("opens a lead in the leads board drawer, since a lead has no page of its own", () => {
    expect(taskEntityHref("Lead", "c1a2b3", ADMINISTRATOR)).toBe(
      "/leads?lead=c1a2b3",
    );
  });

  it("opens an employee's settings page for the CEO and a Branch Director", () => {
    expect(taskEntityHref("User", "10407", CEO)).toBe(
      "/settings/employees/10407",
    );
    expect(taskEntityHref("User", "10407", BRANCH_DIRECTOR)).toBe(
      "/settings/employees/10407",
    );
    expect(taskEntityHref("User", "10407", canForRoles([2, 3]))).toBe(
      "/settings/employees/10407",
    );
  });

  it("gives an Administrator no employee link: settings would send them back to /settings", () => {
    expect(taskEntityHref("User", "10407", ADMINISTRATOR)).toBeNull();
    expect(taskEntityHref("User", "10407", canForRoles([3, 4]))).toBeNull();
  });

  it("keeps the student and group pages", () => {
    expect(taskEntityHref("Student", "10001", ADMINISTRATOR)).toBe(
      "/students/profile/10001",
    );
    expect(taskEntityHref("Group", "g1", ADMINISTRATOR)).toBe("/groups/g1");
  });

  it("gives no link for a type a comment cannot be written on", () => {
    expect(taskEntityHref("Branch", "1001", CEO)).toBeNull();
  });

  // Server bu sahifalarni shu rollarga bermaydi: GET /students/:id da
  // o'qituvchi, GET /groups/:id da kassir yo'q (capabilities students.profile and groups.view).
  it("gives a teacher-only viewer no student link and a cashier-only viewer no group link", () => {
    expect(taskEntityHref("Student", "10001", canForRoles([4]))).toBeNull();
    expect(taskEntityHref("Group", "g1", canForRoles([5]))).toBeNull();
  });

  it("lets another role the viewer holds open the page", () => {
    expect(taskEntityHref("Student", "10001", canForRoles([4, 5]))).toBe(
      "/students/profile/10001",
    );
    expect(taskEntityHref("Group", "g1", canForRoles([5, 4]))).toBe("/groups/g1");
  });
});

describe("taskHref", () => {
  it("opens the task drawer on the tasks page", () => {
    expect(taskHref("t1")).toBe("/tasks?task=t1");
  });
});
