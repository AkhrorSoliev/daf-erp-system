import { describe, expect, it } from "vitest";
import { hasOwnSalary, uzbekRoles } from "./profile-roles";

describe("uzbekRoles", () => {
  it("names every role in Uzbek and keeps the ids", () => {
    const roles = [
      { id: 1, name: "CEO" },
      { id: 2, name: "Branch Director" },
      { id: 3, name: "Administrator" },
      { id: 4, name: "Teacher" },
      { id: 5, name: "Cashier" },
    ];
    expect(uzbekRoles(roles)).toEqual([
      { id: 1, name: "Direktor" },
      { id: 2, name: "Filial direktori" },
      { id: 3, name: "Administrator" },
      { id: 4, name: "O'qituvchi" },
      { id: 5, name: "Kassir" },
    ]);
  });

  it("shows no English role name on screen", () => {
    const names = uzbekRoles([{ id: 4, name: "Teacher" }]).map((r) => r.name);
    expect(names).not.toContain("Teacher");
  });
});

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
