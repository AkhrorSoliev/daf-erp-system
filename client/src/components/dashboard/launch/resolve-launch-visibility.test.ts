import { describe, expect, it } from "vitest";
import type { BranchReadiness } from "./launch-types";
import { resolveLaunchVisibility } from "./resolve-launch-visibility";

const readiness = (over: Partial<BranchReadiness> = {}): BranchReadiness => ({
  branchId: 2,
  branchName: "Namangan",
  ready: false,
  launched: false,
  checks: [],
  ...over,
});

const base = {
  roleIds: [2],
  selectedBranchId: 2,
  readiness: readiness(),
  flags: { seen: false, celebrated: false, launched: false },
};

describe("resolveLaunchVisibility", () => {
  it("director, a branch that has not launched → the map", () => {
    expect(resolveLaunchVisibility(base)).toBe("journey");
  });

  it("a CEO who picked a specific branch sees it too", () => {
    expect(resolveLaunchVisibility({ ...base, roleIds: [1] })).toBe("journey");
  });

  it("a CEO on \"All branches\" does not see it", () => {
    expect(
      resolveLaunchVisibility({ ...base, roleIds: [1], selectedBranchId: null }),
    ).toBe("hidden");
  });

  it.each([[[3]], [[4]], [[5]], [[3, 5]], [[]]])("hidden for roles %j", (roleIds) => {
    expect(resolveLaunchVisibility({ ...base, roleIds })).toBe("hidden");
  });

  it("director + administrator — sees it", () => {
    expect(resolveLaunchVisibility({ ...base, roleIds: [2, 3] })).toBe("journey");
  });

  it("the request failed or has not arrived yet → hidden", () => {
    expect(resolveLaunchVisibility({ ...base, readiness: undefined })).toBe("hidden");
  });

  it("an old server (no launched field) → hidden", () => {
    const old = { branchId: 2, branchName: "N", ready: false, checks: [] } as unknown as BranchReadiness;
    expect(resolveLaunchVisibility({ ...base, readiness: old })).toBe("hidden");
  });

  it("a stale response for another branch → hidden", () => {
    expect(
      resolveLaunchVisibility({ ...base, readiness: readiness({ branchId: 1 }) }),
    ).toBe("hidden");
  });

  it("launched, the card was seen, no celebration yet → celebrate", () => {
    expect(
      resolveLaunchVisibility({
        ...base,
        readiness: readiness({ launched: true }),
        flags: { seen: true, celebrated: false, launched: false },
      }),
    ).toBe("celebrate");
  });

  it("the celebration was closed → hidden", () => {
    expect(
      resolveLaunchVisibility({
        ...base,
        readiness: readiness({ launched: true }),
        flags: { seen: true, celebrated: true, launched: false },
      }),
    ).toBe("hidden");
  });

  it("Farg'ona: already running, the card was never seen → hidden", () => {
    expect(
      resolveLaunchVisibility({ ...base, readiness: readiness({ launched: true }) }),
    ).toBe("hidden");
  });

  describe("flags.launched has latched", () => {
    it("seen and not yet celebrated → celebrate", () => {
      expect(
        resolveLaunchVisibility({
          ...base,
          flags: { seen: true, celebrated: false, launched: true },
        }),
      ).toBe("celebrate");
    });

    it("already celebrated → hidden", () => {
      expect(
        resolveLaunchVisibility({
          ...base,
          flags: { seen: true, celebrated: true, launched: true },
        }),
      ).toBe("hidden");
    });

    it("not seen at all → hidden", () => {
      expect(
        resolveLaunchVisibility({
          ...base,
          flags: { seen: false, celebrated: false, launched: true },
        }),
      ).toBe("hidden");
    });

    it("a stale launched:false readiness response does not resurrect the map", () => {
      expect(
        resolveLaunchVisibility({
          ...base,
          readiness: readiness({ launched: false }),
          flags: { seen: true, celebrated: false, launched: true },
        }),
      ).toBe("celebrate");
    });

    it("stale readiness + already celebrated stays hidden, not journey", () => {
      expect(
        resolveLaunchVisibility({
          ...base,
          readiness: readiness({ launched: false }),
          flags: { seen: true, celebrated: true, launched: true },
        }),
      ).toBe("hidden");
    });

    it("readiness missing entirely still resolves from the flag alone", () => {
      expect(
        resolveLaunchVisibility({
          ...base,
          readiness: undefined,
          flags: { seen: true, celebrated: false, launched: true },
        }),
      ).toBe("celebrate");
    });
  });
});
