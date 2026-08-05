import { describe, expect, it } from "vitest";
import {
  ALL_BRANCHES,
  BRANCH_KEY_BOOT,
  branchHeaderValue,
  branchScopeKey,
  resolveStoredBranch,
} from "./branch-header";

/**
 * The active branch used to live only in `localStorage` and reach the API as a
 * `?branch_id=` parameter added by hand in ~37 components. A page that forgot it
 * silently showed company-wide data under a header naming one branch. These
 * cover the two decisions the client now makes: what it claims on the wire, and
 * which saved selection is still legal.
 */
describe("branchHeaderValue — what the client claims per request", () => {
  it("sends the selected branch id", () => {
    expect(branchHeaderValue("2")).toBe("2");
  });

  it("sends NOTHING for 'Barcha filiallar'", () => {
    // Absent means "no pick", which the server resolves to the caller's full
    // scope. Sending a literal "all" would be a value the server must special
    // case, and a value a client could try to abuse.
    expect(branchHeaderValue(ALL_BRANCHES)).toBeNull();
  });

  it("sends nothing when no branch has been chosen yet", () => {
    expect(branchHeaderValue(null)).toBeNull();
    expect(branchHeaderValue("")).toBeNull();
  });

  it("changes with the switcher, so every request follows the selection", () => {
    // The point of the header: one place decides, and it applies to requests
    // whose component never mentions a branch.
    expect(branchHeaderValue("1")).toBe("1");
    expect(branchHeaderValue("2")).toBe("2");
  });
});

describe("resolveStoredBranch — a stale selection must not survive", () => {
  const FARGONA = { id: 1, name: "Fargona" };
  const NAMANGAN = { id: 2, name: "Namangan" };

  it("restores a saved branch that is still available", () => {
    expect(resolveStoredBranch("2", [FARGONA, NAMANGAN], true)).toBe(NAMANGAN);
  });

  it("DROPS a saved branch the current user cannot see", () => {
    // Signing in as a Namangan-only user on a machine that last held Fargona.
    // Keeping it would leave the header naming a branch the server refuses,
    // which renders as an empty page rather than as a permission problem.
    expect(resolveStoredBranch("1", [NAMANGAN], false)).toBe(NAMANGAN);
  });

  it("defaults a CEO to the consolidated view", () => {
    expect(resolveStoredBranch(null, [FARGONA, NAMANGAN], true)).toBeNull();
  });

  it("never gives a non-CEO the consolidated view, even from a stale value", () => {
    expect(resolveStoredBranch(ALL_BRANCHES, [NAMANGAN], false)).toBe(NAMANGAN);
  });

  it("keeps 'Barcha filiallar' for a CEO", () => {
    expect(resolveStoredBranch(ALL_BRANCHES, [FARGONA, NAMANGAN], true)).toBeNull();
  });

  it("returns null when the user has no branch at all", () => {
    expect(resolveStoredBranch("1", [], false)).toBeNull();
  });

  it("ignores a non-numeric saved value", () => {
    expect(resolveStoredBranch("oops", [FARGONA], false)).toBe(FARGONA);
  });
});

/**
 * The remount key for the dashboard's page content.
 *
 * This is the half of the fix that `BranchQuerySync` cannot do: it clears the
 * React Query cache, but ~47 components fetch with `useState` + `useEffect` and
 * never consult that cache. Changing this key unmounts them, so their effects
 * re-run. Get it wrong and either nothing reloads (the reported bug) or every
 * page remounts on first paint and throws away its own initial load.
 */
describe("branchScopeKey", () => {
  it("returns a sentinel before the branch list resolves", () => {
    // Keying on the not-yet-known selection would make the first resolution look
    // like a switch and remount every page mid-load.
    expect(branchScopeKey(null, false)).toBe(BRANCH_KEY_BOOT);
    expect(branchScopeKey({ id: 1 }, false)).toBe(BRANCH_KEY_BOOT);
  });

  it("distinguishes 'Barcha filiallar' from 'not resolved yet'", () => {
    // Both are `selectedBranch === null`. Collapsing them would mean a CEO
    // switching from Fargona to "Barcha filiallar" produced the boot key —
    // matching the pre-load value and skipping the remount.
    expect(branchScopeKey(null, true)).toBe(ALL_BRANCHES);
    expect(branchScopeKey(null, true)).not.toBe(BRANCH_KEY_BOOT);
  });

  it("changes on every switch that changes what the server returns", () => {
    const fargona = branchScopeKey({ id: 1 }, true);
    const namangan = branchScopeKey({ id: 2 }, true);
    const all = branchScopeKey(null, true);

    // The reported bug: Fargona → Namangan showed Fargona's leads until refresh.
    expect(fargona).not.toBe(namangan);
    // And both directions out of the consolidated view.
    expect(all).not.toBe(fargona);
    expect(all).not.toBe(namangan);
    expect(new Set([fargona, namangan, all]).size).toBe(3);
  });

  it("is stable for the same selection", () => {
    // A re-render that did not change the branch must not remount the page —
    // that would discard in-flight requests and reset scroll on every keystroke
    // in an unrelated store.
    expect(branchScopeKey({ id: 2 }, true)).toBe(branchScopeKey({ id: 2 }, true));
  });

  it("never collides a branch id with the sentinels", () => {
    // A branch literally named 0, or an id stringifying to "all"/"boot", would
    // silently suppress a remount.
    for (const id of [0, 1, 2, 99, 1001]) {
      const key = branchScopeKey({ id }, true);
      expect(key).not.toBe(BRANCH_KEY_BOOT);
      expect(key).not.toBe(ALL_BRANCHES);
    }
  });
});
