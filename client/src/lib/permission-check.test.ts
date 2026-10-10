import { describe, expect, it } from "vitest";
import {
  isPermissionsMeUrl,
  makeCan,
  parseStoredPermissions,
} from "./permission-check";

describe("isPermissionsMeUrl", () => {
  it("recognises the list's own request, with or without a query", () => {
    expect(isPermissionsMeUrl("/permissions/me")).toBe(true);
    expect(isPermissionsMeUrl("/permissions/me?x=1")).toBe(true);
  });

  it("leaves every other route alone", () => {
    expect(isPermissionsMeUrl("/students")).toBe(false);
    expect(isPermissionsMeUrl("/permissions/roles")).toBe(false);
    expect(isPermissionsMeUrl("/permissions/me/extra")).toBe(false);
    expect(isPermissionsMeUrl(undefined)).toBe(false);
    expect(isPermissionsMeUrl("")).toBe(false);
  });
});

describe("makeCan", () => {
  const can = makeCan(new Set(["groups.view", "attendance.mark"]));

  it("answers one capability", () => {
    expect(can("groups.view")).toBe(true);
    expect(can("salary.view")).toBe(false);
  });

  it("answers ANY of several", () => {
    expect(can(["salary.view", "attendance.mark"])).toBe(true);
    expect(can(["salary.view", "expenses.view"])).toBe(false);
  });

  it("holds nothing before the list is known", () => {
    expect(makeCan(null)("groups.view")).toBe(false);
  });
});

describe("parseStoredPermissions", () => {
  it("returns the list kept for this user", () => {
    const raw = JSON.stringify({ userId: 7, keys: ["groups.view"] });
    expect([...(parseStoredPermissions(raw, 7) ?? [])]).toEqual(["groups.view"]);
  });

  it("ignores another user's list, a broken value and unknown keys", () => {
    expect(
      parseStoredPermissions(JSON.stringify({ userId: 8, keys: [] }), 7),
    ).toBeNull();
    expect(parseStoredPermissions("{", 7)).toBeNull();
    expect(parseStoredPermissions(null, 7)).toBeNull();
    const raw = JSON.stringify({ userId: 7, keys: ["groups.view", "no.such"] });
    expect([...(parseStoredPermissions(raw, 7) ?? [])]).toEqual(["groups.view"]);
  });
});
