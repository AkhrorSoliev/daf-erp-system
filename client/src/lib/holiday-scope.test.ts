import { describe, expect, it } from "vitest";
import {
  CENTRE_WIDE,
  holidayBranchChoices,
  holidayScopeLabel,
  mayManageHoliday,
  newHolidayBranchId,
  toHoliday,
} from "./holiday-scope";

const fargona = { id: 1, name: "Farg'ona" };
const namangan = { id: 2, name: "Namangan" };

describe("holiday scope (CEO decision 10.10.2026)", () => {
  it("names whose a holiday is", () => {
    expect(holidayScopeLabel({ branchId: null, branchName: null })).toBe(
      "Butun markaz",
    );
    expect(holidayScopeLabel({ branchId: 2, branchName: "Namangan" })).toBe(
      "Namangan",
    );
  });

  it("reads the branch name the list sends, and none from a create answer", () => {
    const row = {
      id: "h",
      name: "X",
      date: "2026-03-21",
      endDate: "2026-03-21",
      branchId: 2,
    };
    expect(toHoliday({ ...row, branch: { name: "Namangan" } }).branchName).toBe(
      "Namangan",
    );
    expect(toHoliday(row).branchName).toBeNull();
  });

  it("keeps a centre-wide holiday's actions for the CEO alone", () => {
    expect(mayManageHoliday(true, null)).toBe(true);
    expect(mayManageHoliday(false, null)).toBe(false);
    expect(mayManageHoliday(false, 1)).toBe(true);
  });

  it("offers the CEO the branch in view, or every branch on «Barcha filiallar»", () => {
    expect(holidayBranchChoices(namangan, [fargona, namangan])).toEqual([
      namangan,
    ]);
    expect(holidayBranchChoices(null, [fargona, namangan])).toEqual([
      fargona,
      namangan,
    ]);
  });

  it("sends the CEO's choice, and a non-CEO's branch from the switcher", () => {
    expect(newHolidayBranchId(true, CENTRE_WIDE, namangan)).toBeNull();
    expect(newHolidayBranchId(true, "2", null)).toBe(2);
    // A non-CEO never chooses: the holiday goes to the branch in view.
    expect(newHolidayBranchId(false, CENTRE_WIDE, fargona)).toBe(1);
    expect(newHolidayBranchId(false, CENTRE_WIDE, null)).toBeUndefined();
  });
});
