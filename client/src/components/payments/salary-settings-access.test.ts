import { describe, expect, it } from "vitest";
import {
  canDirectorRate,
  resolveSalarySettingsAccess,
} from "./salary-settings-access";

describe("resolveSalarySettingsAccess", () => {
  it("CEO: everything", () => {
    expect(resolveSalarySettingsAccess([1])).toEqual({
      canOpen: true,
      canManageCompanyPayroll: true,
      canDeactivateRate: true,
    });
  });

  it("a branch director: only teacher rates (ADR-0033)", () => {
    expect(resolveSalarySettingsAccess([2])).toEqual({
      canOpen: true,
      canManageCompanyPayroll: false,
      canDeactivateRate: false,
    });
  });

  it("director + administrator — director's rights", () => {
    expect(resolveSalarySettingsAccess([2, 3]).canOpen).toBe(true);
  });

  it.each([[[3]], [[4]], [[5]], [[]]])('%j: no "Sozlamalar"', (roleIds) => {
    expect(resolveSalarySettingsAccess(roleIds).canOpen).toBe(false);
  });
});

describe("canDirectorRate", () => {
  const TEACHER = { name: "Teacher" };
  const CEO = { name: "CEO" };
  const BRANCH_DIRECTOR = { name: "Branch Director" };
  const ADMINISTRATOR = { name: "Administrator" };
  const SELF_ID = 90010;
  const OTHER_ID = 90020;

  it("a plain teacher — ratable", () => {
    expect(canDirectorRate({ id: OTHER_ID, roles: [TEACHER] }, SELF_ID)).toBe(
      true,
    );
  });

  it("an administrator who also teaches — ratable (ADR-0033's admin-teacher case)", () => {
    expect(
      canDirectorRate(
        { id: OTHER_ID, roles: [ADMINISTRATOR, TEACHER] },
        SELF_ID,
      ),
    ).toBe(true);
  });

  it("a pure administrator, no Teacher role — not ratable", () => {
    expect(
      canDirectorRate({ id: OTHER_ID, roles: [ADMINISTRATOR] }, SELF_ID),
    ).toBe(false);
  });

  it("holds Teacher but also CEO — not ratable", () => {
    expect(
      canDirectorRate({ id: OTHER_ID, roles: [TEACHER, CEO] }, SELF_ID),
    ).toBe(false);
  });

  it("holds Teacher but also Branch Director — not ratable (another director)", () => {
    expect(
      canDirectorRate(
        { id: OTHER_ID, roles: [TEACHER, BRANCH_DIRECTOR] },
        SELF_ID,
      ),
    ).toBe(false);
  });

  it("the target is the caller themself — not ratable, even as a plain teacher", () => {
    expect(canDirectorRate({ id: SELF_ID, roles: [TEACHER] }, SELF_ID)).toBe(
      false,
    );
  });

  it("no roles at all — not ratable", () => {
    expect(canDirectorRate({ id: OTHER_ID, roles: [] }, SELF_ID)).toBe(false);
  });

  // R6: an inactive/terminated teacher must not stay editable in the
  // director's list — the row is locked, not just left rateable-but-403ing.
  it("isActive:false — not ratable even as an otherwise-plain teacher", () => {
    expect(
      canDirectorRate(
        { id: OTHER_ID, roles: [TEACHER], isActive: false },
        SELF_ID,
      ),
    ).toBe(false);
  });

  it("status other than ACTIVE (e.g. TERMINATED) — not ratable", () => {
    expect(
      canDirectorRate(
        { id: OTHER_ID, roles: [TEACHER], status: "TERMINATED" },
        SELF_ID,
      ),
    ).toBe(false);
  });

  it("status SUSPENDED — not ratable", () => {
    expect(
      canDirectorRate(
        { id: OTHER_ID, roles: [TEACHER], status: "SUSPENDED" },
        SELF_ID,
      ),
    ).toBe(false);
  });

  it("isActive:true and status:ACTIVE explicitly — still ratable", () => {
    expect(
      canDirectorRate(
        { id: OTHER_ID, roles: [TEACHER], isActive: true, status: "ACTIVE" },
        SELF_ID,
      ),
    ).toBe(true);
  });

  it("isActive/status both absent — still ratable (backward compatible)", () => {
    expect(canDirectorRate({ id: OTHER_ID, roles: [TEACHER] }, SELF_ID)).toBe(
      true,
    );
  });
});
