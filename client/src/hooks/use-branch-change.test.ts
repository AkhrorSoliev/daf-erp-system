import { describe, expect, it } from "vitest";
import { resolveBranchSwitch } from "./use-branch-change";

/**
 * The rule is driven by the switcher's `scopeVersion` — the same counter that
 * keys `BranchScopedMain` — so the page remount and the cache/store reset can
 * never disagree about what counts as a switch. They used to: the remount keyed
 * on the selection while this rule ignored the first resolution, so a non-CEO
 * whose first requests went out with their whole scope got a fresh page that
 * read those whole-scope responses straight back out of the cache.
 */
describe("resolveBranchSwitch", () => {
  it("adopts the first value a caller sees without reporting a switch", () => {
    // A caller that mounts after a switch has nothing stale to clear.
    expect(resolveBranchSwitch(undefined, 0)).toEqual({ switched: false, next: 0 });
    expect(resolveBranchSwitch(undefined, 3)).toEqual({ switched: false, next: 3 });
  });

  it("reports a switch when the scope version moves", () => {
    expect(resolveBranchSwitch(0, 1)).toEqual({ switched: true, next: 1 });
    expect(resolveBranchSwitch(4, 5)).toEqual({ switched: true, next: 5 });
  });

  it("reports the first resolution when it replaced the saved branch", () => {
    // `scopeVersion` only moves off 0 on load when the saved branch was
    // replaced — so a caller that saw 0 must clear what it cached under it.
    expect(resolveBranchSwitch(0, 1).switched).toBe(true);
  });

  it("stays quiet when the version did not move", () => {
    expect(resolveBranchSwitch(2, 2)).toEqual({ switched: false, next: 2 });
  });
});
