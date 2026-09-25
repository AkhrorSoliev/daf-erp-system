import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { STATUS_TRANSITIONS } from "./status-config";

/**
 * The status dialog offers what this table lists, and the server validates
 * the same change against its own STATUS_TRANSITIONS
 * (`server/src/common/status/status-transitions.ts`). An option the server
 * refuses is a button that always fails with a 400: the client offered
 * FROZEN → EXPELLED for three months while the server rejected it, and admins
 * reactivated the student first to get around it.
 *
 * The server may allow more than the dialog offers (GRADUATED is set only
 * when a group completes; ARCHIVED → ACTIVE is a restore from the archive),
 * so the check is one way: every offered transition must be accepted.
 */

/** Client entity key → the entity type its server status route validates. */
const SERVER_ENTITY: Record<string, string> = {
  students: "Student",
  teachers: "User",
  groups: "Group",
  courses: "Course",
  branches: "Branch",
  rooms: "Room",
  holidays: "Holiday",
};

type TransitionTable = Record<string, Record<string, string[]>>;

// The client cannot import server code (it deploys on its own), so the
// server's table is read from its source. If this throws after a change to
// that file, update the parser rather than the table.
function parseServerTransitions(source: string): TransitionTable {
  // Comments go first: a commented-out old row would otherwise be read as a
  // live one.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const body = code.match(/STATUS_TRANSITIONS[^=]*=\s*\{([\s\S]*?)\n\};/)?.[1];
  if (!body) throw new Error("STATUS_TRANSITIONS not found in the server source");
  const table: TransitionTable = {};
  for (const [, entity, rows] of body.matchAll(/(\w+):\s*\{([^{}]*)\}/g)) {
    if (entity in table) throw new Error(`STATUS_TRANSITIONS lists ${entity} twice`);
    table[entity] = {};
    for (const [, from, targets] of rows.matchAll(/(\w+):\s*\[([^\]]*)\]/g)) {
      if (from in table[entity]) {
        throw new Error(`STATUS_TRANSITIONS lists ${entity}.${from} twice`);
      }
      table[entity][from] = [...targets.matchAll(/'(\w+)'/g)].map((m) => m[1]);
    }
  }
  return table;
}

describe("status dialog offers only what the server accepts", () => {
  const serverTable = parseServerTransitions(
    readFileSync(
      join(__dirname, "../../../server/src/common/status/status-transitions.ts"),
      "utf8",
    ),
  );

  it("knows which server table each client entity is checked against", () => {
    // A new entity here without a mapping would be skipped by the check below.
    expect(Object.keys(STATUS_TRANSITIONS).sort()).toEqual(
      Object.keys(SERVER_ENTITY).sort(),
    );
    for (const serverEntity of Object.values(SERVER_ENTITY)) {
      expect(Object.keys(serverTable[serverEntity] ?? {})).not.toHaveLength(0);
    }
  });

  it.each(Object.entries(SERVER_ENTITY))(
    "%s: every offered transition is accepted by the server's %s table",
    (clientEntity, serverEntity) => {
      const refused: string[] = [];
      for (const [from, offered] of Object.entries(STATUS_TRANSITIONS[clientEntity])) {
        const accepted = serverTable[serverEntity][from] ?? [];
        for (const to of offered) {
          if (!accepted.includes(to)) refused.push(`${from} → ${to}`);
        }
      }
      expect(refused).toEqual([]);
    },
  );
});

describe("parseServerTransitions", () => {
  it("reads the live rows, never a commented-out one", () => {
    const source = [
      "export const STATUS_TRANSITIONS: Record<string, Record<string, string[]>> = {",
      "  Student: {",
      "    ACTIVE: ['FROZEN', 'EXPELLED'],",
      "    // was: FROZEN: ['ACTIVE', 'EXPELLED', 'ARCHIVED'],",
      "    /* FROZEN: ['EXPELLED'], */",
      "    FROZEN: ['ACTIVE', 'ARCHIVED'], // a comment after a row",
      "  },",
      "",
      "  Holiday: {",
      "    ACTIVE: ['CANCELLED'],",
      "    CANCELLED: [],",
      "  },",
      "};",
      "",
      "export function isValidTransition() {}",
    ].join("\n");
    expect(parseServerTransitions(source)).toEqual({
      Student: { ACTIVE: ["FROZEN", "EXPELLED"], FROZEN: ["ACTIVE", "ARCHIVED"] },
      Holiday: { ACTIVE: ["CANCELLED"], CANCELLED: [] },
    });
  });

  it("fails loudly when the table is not where it expects", () => {
    expect(() => parseServerTransitions("export const OTHER = {};")).toThrow(
      "STATUS_TRANSITIONS not found",
    );
  });
});
