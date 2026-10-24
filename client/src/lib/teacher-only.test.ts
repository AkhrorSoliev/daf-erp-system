import { describe, expect, it } from "vitest";
import { isTeacherOnly } from "./teacher-only";

describe("isTeacherOnly", () => {
  it("is true for a plain teacher", () => {
    expect(isTeacherOnly([{ id: 4 }])).toBe(true);
  });

  it("is false when a management role comes with it", () => {
    for (const id of [1, 2, 3]) {
      expect(isTeacherOnly([{ id: 4 }, { id }])).toBe(false);
    }
  });

  it("is false for staff who do not teach", () => {
    expect(isTeacherOnly([{ id: 3 }])).toBe(false);
    expect(isTeacherOnly([{ id: 5 }])).toBe(false);
  });

  it("is false while the user is not known yet", () => {
    expect(isTeacherOnly(undefined)).toBe(false);
    expect(isTeacherOnly([])).toBe(false);
  });
});
