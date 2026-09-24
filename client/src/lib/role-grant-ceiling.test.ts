import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import {
  GRANTABLE_BY_ROLE,
  grantableRoleIdsFor,
  roleFieldFor,
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

describe("roleFieldFor — what the employee form's role field shows", () => {
  const NEW_EMPLOYEE: number[] = [];

  it("offers a new employee exactly the caller's grantable roles", () => {
    expect(roleFieldFor(["CEO"], NEW_EMPLOYEE)).toEqual({
      mode: "pick",
      roleIds: [CEO, BRANCH_DIRECTOR, ADMINISTRATOR, TEACHER, CASHIER],
    });
    expect(roleFieldFor(["Branch Director"], NEW_EMPLOYEE)).toEqual({
      mode: "pick",
      roleIds: [ADMINISTRATOR, TEACHER, CASHIER],
    });
    expect(roleFieldFor(["Administrator"], NEW_EMPLOYEE)).toEqual({
      mode: "pick",
      roleIds: [TEACHER, CASHIER],
    });
  });

  it("offers toggles for an employee whose every role is inside the ceiling", () => {
    expect(roleFieldFor(["Branch Director"], [ADMINISTRATOR])).toEqual({
      mode: "pick",
      roleIds: [ADMINISTRATOR, TEACHER, CASHIER],
    });
    expect(roleFieldFor(["Administrator"], [TEACHER, CASHIER])).toEqual({
      mode: "pick",
      roleIds: [TEACHER, CASHIER],
    });
  });

  it("shows a non-CEO's own roles read-only", () => {
    expect(roleFieldFor(["Branch Director"], [BRANCH_DIRECTOR])).toEqual({
      mode: "read-only",
      roleIds: [BRANCH_DIRECTOR],
    });
    expect(roleFieldFor(["Administrator"], [ADMINISTRATOR, TEACHER])).toEqual({
      mode: "read-only",
      roleIds: [ADMINISTRATOR, TEACHER],
    });
  });

  it("shows a peer's or a superior's roles read-only, grantable ones included", () => {
    expect(roleFieldFor(["Branch Director"], [BRANCH_DIRECTOR, TEACHER])).toEqual({
      mode: "read-only",
      roleIds: [BRANCH_DIRECTOR, TEACHER],
    });
    expect(roleFieldFor(["Branch Director"], [CEO])).toEqual({
      mode: "read-only",
      roleIds: [CEO],
    });
    expect(roleFieldFor(["Administrator"], [ADMINISTRATOR])).toEqual({
      mode: "read-only",
      roleIds: [ADMINISTRATOR],
    });
  });

  it("lets a CEO change anyone's roles, their own included", () => {
    expect(roleFieldFor(["CEO"], [CEO])).toEqual({
      mode: "pick",
      roleIds: [CEO, BRANCH_DIRECTOR, ADMINISTRATOR, TEACHER, CASHIER],
    });
  });

  it("gives a caller with no ceiling nothing to pick, and nothing to change", () => {
    expect(roleFieldFor(["Cashier"], NEW_EMPLOYEE)).toEqual({ mode: "hidden" });
    expect(roleFieldFor(["Cashier"], [TEACHER])).toEqual({
      mode: "read-only",
      roleIds: [TEACHER],
    });
  });
});

describe("GRANTABLE_BY_ROLE matches the backend map", () => {
  // The client cannot import server code (it deploys on its own), so the
  // server's map is read from its source. If this fails after a change to
  // GRANTABLE_ROLE_IDS, update GRANTABLE_BY_ROLE with it; if it fails because
  // that map is no longer a literal, update parseGrantableMap.
  const SERVER_KEY_TO_ROLE_NAME: Record<string, string> = {
    CEO: "CEO",
    BRANCH_DIRECTOR: "Branch Director",
    ADMINISTRATOR: "Administrator",
  };

  function parseGrantableMap(source: string): Record<string, number[]> {
    const body = source.match(
      /export const GRANTABLE_ROLE_IDS\s*=\s*\{([\s\S]*?)\}/,
    )?.[1];
    if (!body) throw new Error("GRANTABLE_ROLE_IDS not found in constants.ts");
    // Comments go first: a commented-out old row would otherwise be read as a
    // row and overwrite the live one, keeping this test green on a stale map.
    const code = body.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    const map: Record<string, number[]> = {};
    for (const [, key, ids] of code.matchAll(/(\w+):\s*\[([^\]]*)\]/g)) {
      const roleName = SERVER_KEY_TO_ROLE_NAME[key] ?? `unmapped ${key}`;
      if (roleName in map) throw new Error(`GRANTABLE_ROLE_IDS lists ${key} twice`);
      map[roleName] = ids.split(",").map((id) => Number(id.trim()));
    }
    return map;
  }

  it("has the same rows as GRANTABLE_ROLE_IDS", () => {
    const source = readFileSync(
      join(__dirname, "../../../server/src/telegram/constants.ts"),
      "utf8",
    );
    expect(GRANTABLE_BY_ROLE).toEqual(parseGrantableMap(source));
  });

  it("reads the live rows, never a commented-out one", () => {
    const source = [
      "export const GRANTABLE_ROLE_IDS = {",
      "  CEO: [1, 2, 3, 4, 5],",
      "  BRANCH_DIRECTOR: [3, 4],",
      "  // was: BRANCH_DIRECTOR: [3, 4, 5],",
      "  /* ADMINISTRATOR: [4] */",
      "  ADMINISTRATOR: [4, 5],",
      "} as const;",
    ].join("\n");
    expect(parseGrantableMap(source)).toEqual({
      CEO: [1, 2, 3, 4, 5],
      "Branch Director": [3, 4],
      Administrator: [4, 5],
    });
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
      /import\s*\{[^}]*\b(grantableRoleIdsFor|roleFieldFor)\b[^}]*\}\s*from\s*"@\/lib\/role-grant-ceiling"/,
    );
  });

  it("no other file keeps a name-keyed copy of the map", () => {
    const copies = readdirSync(SRC, { recursive: true, encoding: "utf8" })
      .filter((file) => /\.tsx?$/.test(file) && !file.endsWith(".test.ts"))
      .filter((file) =>
        /(["']Branch Director["']|\bBRANCH_DIRECTOR)\s*:\s*\[/.test(read(file)),
      );
    expect(copies).toEqual(["lib/role-grant-ceiling.ts"]);
  });
});
