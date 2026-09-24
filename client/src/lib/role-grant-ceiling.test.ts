import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import {
  GRANTABLE_BY_ROLE,
  grantableRoleIdsFor,
  mayChangeRoles,
} from "./role-grant-ceiling";

/**
 * The client half of the role ceiling (ADR-0026). The backend refuses what a
 * caller may not grant; this module only decides what the UI offers, so every
 * case here is one where the two halves must agree: a role the form offers and
 * the server rejects is the bug this module exists to prevent.
 */

const CEO = 1;
const BRANCH_DIRECTOR = 2;
const ADMINISTRATOR = 3;
const TEACHER = 4;
const CASHIER = 5;

describe("grantableRoleIdsFor — which roles a caller may hand out", () => {
  it("lets a CEO grant every staff role", () => {
    expect(grantableRoleIdsFor(["CEO"])).toEqual([
      CEO,
      BRANCH_DIRECTOR,
      ADMINISTRATOR,
      TEACHER,
      CASHIER,
    ]);
  });

  it("lets a Branch Director grant Administrator, Teacher and Cashier", () => {
    expect(grantableRoleIdsFor(["Branch Director"])).toEqual([
      ADMINISTRATOR,
      TEACHER,
      CASHIER,
    ]);
  });

  it("lets an Administrator grant Teacher and Cashier", () => {
    expect(grantableRoleIdsFor(["Administrator"])).toEqual([TEACHER, CASHIER]);
  });

  it("gives nothing to a caller holding none of the three, never a default row", () => {
    expect(grantableRoleIdsFor(["Teacher", "Cashier"])).toEqual([]);
    expect(grantableRoleIdsFor([])).toEqual([]);
  });

  it("takes the most senior role, whatever order the roles arrive in", () => {
    // The junior roles come first on purpose: a loop that stopped at the first
    // role it recognised would return their ceiling instead.
    expect(
      grantableRoleIdsFor(["Cashier", "Administrator", "Branch Director"]),
    ).toEqual([ADMINISTRATOR, TEACHER, CASHIER]);
    expect(grantableRoleIdsFor(["Administrator", "CEO"])).toEqual([
      CEO,
      BRANCH_DIRECTOR,
      ADMINISTRATOR,
      TEACHER,
      CASHIER,
    ]);
  });
});

describe("mayChangeRoles — toggles or a read-only list", () => {
  const ceo = grantableRoleIdsFor(["CEO"]);
  const director = grantableRoleIdsFor(["Branch Director"]);
  const admin = grantableRoleIdsFor(["Administrator"]);

  it("allows a new employee, who holds no role yet", () => {
    expect(mayChangeRoles(director, [])).toBe(true);
    expect(mayChangeRoles(admin, [])).toBe(true);
  });

  it("allows an employee whose every role is inside the caller's ceiling", () => {
    expect(mayChangeRoles(director, [ADMINISTRATOR])).toBe(true);
    expect(mayChangeRoles(director, [TEACHER, CASHIER])).toBe(true);
    expect(mayChangeRoles(admin, [TEACHER])).toBe(true);
  });

  it("refuses a non-CEO their own roles", () => {
    expect(mayChangeRoles(director, [BRANCH_DIRECTOR])).toBe(false);
    expect(mayChangeRoles(admin, [ADMINISTRATOR, TEACHER])).toBe(false);
  });

  it("refuses a peer or a superior, even one who also holds a grantable role", () => {
    expect(mayChangeRoles(director, [BRANCH_DIRECTOR, TEACHER])).toBe(false);
    expect(mayChangeRoles(director, [CEO])).toBe(false);
    expect(mayChangeRoles(admin, [ADMINISTRATOR])).toBe(false);
  });

  it("lets a CEO change anyone's roles, their own included", () => {
    expect(mayChangeRoles(ceo, [CEO])).toBe(true);
    expect(mayChangeRoles(ceo, [BRANCH_DIRECTOR, ADMINISTRATOR])).toBe(true);
  });

  it("refuses a caller with no ceiling any employee who holds a role", () => {
    expect(mayChangeRoles([], [TEACHER])).toBe(false);
  });
});

describe("GRANTABLE_BY_ROLE matches the backend map", () => {
  // The client cannot import server code, so the server's map is read from
  // its source. If this fails after a change to GRANTABLE_ROLE_IDS, update
  // GRANTABLE_BY_ROLE with it; if it fails because that map is no longer a
  // literal, update the parsing below.
  const SERVER_KEY_TO_ROLE_NAME: Record<string, string> = {
    CEO: "CEO",
    BRANCH_DIRECTOR: "Branch Director",
    ADMINISTRATOR: "Administrator",
  };

  function serverGrantableMap(): Record<string, number[]> {
    const source = readFileSync(
      join(__dirname, "../../../server/src/telegram/constants.ts"),
      "utf8",
    );
    const body = source.match(/GRANTABLE_ROLE_IDS\s*=\s*\{([\s\S]*?)\}/)?.[1];
    if (!body) throw new Error("GRANTABLE_ROLE_IDS not found in constants.ts");
    const map: Record<string, number[]> = {};
    for (const [, key, ids] of body.matchAll(/(\w+):\s*\[([^\]]*)\]/g)) {
      const roleName = SERVER_KEY_TO_ROLE_NAME[key] ?? `unmapped ${key}`;
      map[roleName] = ids.split(",").map((id) => Number(id.trim()));
    }
    return map;
  }

  it("has the same rows as GRANTABLE_ROLE_IDS", () => {
    expect(GRANTABLE_BY_ROLE).toEqual(serverGrantableMap());
  });
});

describe("one ceiling on the client", () => {
  // The ceiling used to live inside the Telegram link dialog alone, and the
  // employee form offered every role to every caller. The vitest harness
  // renders no components, so the rule is held here at the source level.
  const SRC = join(__dirname, "..");
  const read = (path: string) => readFileSync(join(SRC, path), "utf8");

  it.each([
    "components/settings/edit-employee-form.tsx",
    "components/settings/telegram-link-dialog.tsx",
  ])("%s takes the ceiling from this module", (file) => {
    expect(read(file)).toMatch(
      /import\s*\{[^}]*\bgrantableRoleIdsFor\b[^}]*\}\s*from\s*"@\/lib\/role-grant-ceiling"/,
    );
  });

  it("no other file keeps its own copy of the map", () => {
    const copies = readdirSync(SRC, { recursive: true, encoding: "utf8" })
      .filter((file) => /\.tsx?$/.test(file) && !file.endsWith(".test.ts"))
      .filter((file) =>
        /(["']Branch Director["']|\bBRANCH_DIRECTOR)\s*:\s*\[/.test(read(file)),
      );
    expect(copies).toEqual(["lib/role-grant-ceiling.ts"]);
  });
});
