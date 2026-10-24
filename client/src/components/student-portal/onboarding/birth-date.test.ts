import { describe, expect, it } from "vitest";
import {
  ageOn,
  birthDateBounds,
  birthDateProblem,
  localDateStr,
} from "./birth-date";

describe("onboarding birth date", () => {
  const TODAY = "2026-09-27";

  it("counts full years, turning over on the birthday", () => {
    expect(ageOn("2004-09-28", TODAY)).toBe(21);
    expect(ageOn("2004-09-27", TODAY)).toBe(22);
  });

  it("accepts a plausible date and refuses empty, future and out-of-range ones", () => {
    expect(birthDateProblem("2004-03-15", TODAY)).toBeNull();
    expect(birthDateProblem("", TODAY)).toMatch(/tanlang/);
    expect(birthDateProblem("2026-10-01", TODAY)).toMatch(/kelajakda/);
    expect(birthDateProblem("2023-01-01", TODAY)).toMatch(/Yosh/);
    expect(birthDateProblem("1900-01-01", TODAY)).toMatch(/Yosh/);
  });

  it("reads its message through the page's t, ages as placeholders", () => {
    const t = (source: string, params?: Record<string, string | number>) =>
      `${source}|${JSON.stringify(params ?? {})}`;
    expect(birthDateProblem("1900-01-01", TODAY, t)).toBe(
      `Yosh {min} dan {max} gacha bo'lishi kerak|{"min":5,"max":100}`,
    );
    expect(birthDateProblem("1900-01-01", TODAY)).toBe(
      "Yosh 5 dan 100 gacha bo'lishi kerak",
    );
  });

  it("bounds the picker to the accepted ages", () => {
    const { min, max } = birthDateBounds(TODAY);
    expect(max).toBe("2021-09-27");
    expect(birthDateProblem(max, TODAY)).toBeNull();
    expect(min).toBe("1926-09-27");
    expect(birthDateProblem(min, TODAY)).toBeNull();
  });

  it("formats the browser's calendar date", () => {
    expect(localDateStr(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});
