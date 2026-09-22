import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

/**
 * Two things react to a branch switch, and they must agree on what a switch is:
 *
 *   - `BranchScopedMain` remounts the page content (component-local fetches);
 *   - `useBranchChange` → `BranchQuerySync` clears the React Query cache and the
 *     branch-scoped zustand stores.
 *
 * Both must read the switcher's `scopeVersion`, which moves only when the branch
 * requests claim changes. Each has been wrong on its own before, and no store
 * test notices, because the defect lives in which value the component reads:
 *
 *   - keying `<main>` on the selection (even behind a "not loaded" sentinel)
 *     remounted every page once per hard load, wiping typed input and repeating
 *     the page's first requests;
 *   - deciding "switched" from the selection while the remount used the version
 *     left a fresh page reading the previous scope back out of the cache.
 *
 * The project's vitest harness renders no components, so the rule is held here
 * at the source level.
 */
const ROOT = join(__dirname, "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("one definition of a branch switch", () => {
  it("BranchScopedMain keys the page content on scopeVersion", () => {
    const source = read("components/providers/branch-scoped-main.tsx");

    expect(source).toMatch(/useBranchSwitcher\(\s*\(s\)\s*=>\s*s\.scopeVersion\s*\)/);
    expect(source).toMatch(/<main\s+key=\{scopeVersion\}/);
    expect(source).not.toMatch(/s\.selectedBranch|s\.loaded/);
  });

  it("useBranchChange decides a switch from scopeVersion", () => {
    const source = read("hooks/use-branch-change.ts");

    expect(source).toMatch(/useBranchSwitcher\(\s*\(s\)\s*=>\s*s\.scopeVersion\s*\)/);
    expect(source).not.toMatch(/s\.selectedBranch|s\.loaded/);
  });
});
