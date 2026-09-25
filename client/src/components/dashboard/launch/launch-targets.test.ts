import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LAUNCH_EXTRAS, LAUNCH_STATIONS } from "./launch-stations";

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return tsxFiles(full);
    return full.endsWith(".tsx") ? [full] : [];
  });
}

/**
 * The tour finds its button by `data-tour`. If a refactor drops the
 * attribute, the tour silently turns into a toast — this test catches that
 * breakage in CI.
 */
describe("every tour marker exists in the source", () => {
  const source = tsxFiles(join(__dirname, "..", ".."))
    .map((f) => readFileSync(f, "utf8"))
    .join("\n");
  const ids = [...LAUNCH_STATIONS, ...LAUNCH_EXTRAS].flatMap((s) => s.targets);

  it("11 markers (8 stations + 2 extras, two for \"Ustoz\")", () => {
    expect(ids.length).toBe(11);
  });

  it.each(ids)('data-tour="%s"', (id) => {
    expect(source).toContain(`data-tour="${id}"`);
  });
});
