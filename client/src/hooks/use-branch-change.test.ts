import { describe, expect, it } from "vitest";
import { resolveBranchSwitch } from "./use-branch-change";

/**
 * The two cases in here are the ones that have actually gone wrong: mistaking
 * the first resolution for a switch, and mistaking "Barcha filiallar" for
 * "nothing selected".
 */
describe("resolveBranchSwitch", () => {
  it("does not treat the first resolution as a switch", () => {
    expect(resolveBranchSwitch(undefined, 1)).toEqual({
      switched: false,
      next: 1,
    });
  });

  it("does not treat the first resolution to «Barcha filiallar» as a switch", () => {
    expect(resolveBranchSwitch(undefined, null)).toEqual({
      switched: false,
      next: null,
    });
  });

  it("reports a switch between two branches", () => {
    expect(resolveBranchSwitch(1, 2)).toEqual({ switched: true, next: 2 });
  });

  it("reports a switch INTO «Barcha filiallar» — it is a real selection", () => {
    expect(resolveBranchSwitch(1, null)).toEqual({ switched: true, next: null });
  });

  it("reports a switch OUT of «Barcha filiallar»", () => {
    expect(resolveBranchSwitch(null, 2)).toEqual({ switched: true, next: 2 });
  });

  it("stays quiet when the same branch is re-selected", () => {
    expect(resolveBranchSwitch(2, 2)).toEqual({ switched: false, next: 2 });
    expect(resolveBranchSwitch(null, null)).toEqual({
      switched: false,
      next: null,
    });
  });

  it("carries the new value through even when nothing switched", () => {
    // The caller stores `next` unconditionally; a rule that only returned it on
    // a switch would leave the sentinel in place forever.
    expect(resolveBranchSwitch(undefined, 7).next).toBe(7);
  });
});
