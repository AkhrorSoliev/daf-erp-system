import { describe, expect, it } from "vitest";
import { taskEntityHref } from "./task-entity-href";

const CEO = [1];
const BRANCH_DIRECTOR = [2];
const ADMINISTRATOR = [3];

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
    expect(taskEntityHref("User", "10407", [2, 3])).toBe(
      "/settings/employees/10407",
    );
  });

  it("gives an Administrator no employee link: settings would send them back to /settings", () => {
    expect(taskEntityHref("User", "10407", ADMINISTRATOR)).toBeNull();
    expect(taskEntityHref("User", "10407", [3, 4])).toBeNull();
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
});
