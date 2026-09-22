import { describe, expect, it } from "vitest";
import {
  ALL_BRANCHES,
  branchHeaderValue,
  branchScopeChanged,
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
 * Whether a change to the saved selection changes what requests claim.
 *
 * This decides when the dashboard's page content remounts — the half of the
 * branch-switch fix that `BranchQuerySync` cannot do, since ~47 components
 * fetch with `useState` + `useEffect` and never consult the query cache. Get it
 * wrong in one direction and a switch leaves the previous branch's rows on
 * screen; in the other, the page is thrown away for nothing, typed input
 * included.
 */
describe("branchScopeChanged", () => {
  it("changes on every switch that changes what the server returns", () => {
    // The reported bug: Fargona → Namangan showed Fargona's leads until refresh.
    expect(branchScopeChanged("1", "2")).toBe(true);
    // And both directions out of the consolidated view.
    expect(branchScopeChanged(ALL_BRANCHES, "1")).toBe(true);
    expect(branchScopeChanged("2", ALL_BRANCHES)).toBe(true);
  });

  it("does not change when the same branch is saved again", () => {
    // What resolving the switcher does on nearly every page load. Treating it
    // as a change remounted every page once, after `GET /branches` returned.
    expect(branchScopeChanged("2", "2")).toBe(false);
  });

  it("treats 'nothing saved' and 'Barcha filiallar' as the same scope", () => {
    // Both send no header, so the server returned the same data for both.
    expect(branchScopeChanged(null, ALL_BRANCHES)).toBe(false);
    expect(branchScopeChanged(ALL_BRANCHES, null)).toBe(false);
  });

  it("changes when a first-ever selection names a branch", () => {
    // Requests made with nothing saved asked for the caller's whole scope.
    expect(branchScopeChanged(null, "2")).toBe(true);
  });
});
