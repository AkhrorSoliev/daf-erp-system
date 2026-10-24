import { describe, expect, it } from "vitest";
import { hasOwnSalary, roleTitle } from "./profile-roles";

describe("hasOwnSalary", () => {
  it("is false only for a Director who holds no other role", () => {
    expect(hasOwnSalary([{ id: 1 }])).toBe(false);
  });

  it("is true for every other role", () => {
    for (const id of [2, 3, 4, 5]) {
      expect(hasOwnSalary([{ id }])).toBe(true);
    }
  });

  it("is true for a Director who also teaches", () => {
    expect(hasOwnSalary([{ id: 1 }, { id: 4 }])).toBe(true);
  });
});

describe("roleTitle", () => {
  const t = (s: string) => `[${s}]`;

  it("names the CEO «Direktor (CEO)» only on controls that grant a role", () => {
    expect(roleTitle({ id: 1 }, t, { grant: true })).toBe("[Direktor (CEO)]");
    expect(roleTitle({ id: 1 }, t)).toBe("[Direktor]");
  });

  it("leaves every other role unchanged when granting", () => {
    expect(roleTitle({ id: 2 }, t, { grant: true })).toBe("[Filial direktori]");
    expect(roleTitle({ id: 99, name: "Custom" }, t, { grant: true })).toBe("Custom");
  });
});
