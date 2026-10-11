import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { loadServerFile } from "@/test-support/server-catalog";
import { planToggle, stabilize, type DepGraph } from "./permission-deps";

/**
 * `permission-deps.ts` here is a byte-for-byte copy of the server's
 * `server/src/common/permissions/permission-deps.ts` (ADR-0087): the page
 * plans a toggle with the code the server validates it with. This test fails
 * when the two drift, and runs the server's own vectors against this copy.
 */
interface Vectors {
  DEP_GRAPH: DepGraph;
  TOGGLE_VECTORS: {
    name: string;
    current: string[];
    key: string;
    on: boolean;
    next: string[];
    also: string[];
  }[];
  STABILIZE_VECTORS: { name: string; input: string[]; output: string[] }[];
}

const SERVER_COPY = join(
  __dirname,
  "../../../server/src/common/permissions/permission-deps.ts",
);
const vectors = loadServerFile(
  "common/permissions/permission-deps.vectors.ts",
  {},
) as unknown as Vectors;
const sorted = (keys: Iterable<string>): string[] => [...keys].sort();

describe("permission-deps (client copy)", () => {
  it("is the server file, byte for byte", () => {
    expect(readFileSync(join(__dirname, "permission-deps.ts"), "utf8")).toBe(
      readFileSync(SERVER_COPY, "utf8"),
    );
  });

  it.each(vectors.TOGGLE_VECTORS.map((v) => [v.name, v] as const))(
    "toggle: %s",
    (_name, v) => {
      const plan = planToggle(new Set(v.current), v.key, v.on, vectors.DEP_GRAPH);
      expect(sorted(plan.next)).toEqual(v.next);
      expect(plan.also).toEqual(v.also);
    },
  );

  it.each(vectors.STABILIZE_VECTORS.map((v) => [v.name, v] as const))(
    "stabilize: %s",
    (_name, v) => {
      expect(sorted(stabilize(v.input, vectors.DEP_GRAPH))).toEqual(v.output);
    },
  );
});
