import { describe, expect, it } from "vitest";
import { lateMinutesText } from "./late-minutes";

describe("lateMinutesText", () => {
  it("says how many minutes late", () => {
    expect(lateMinutesText(17)).toBe("17 daqiqa kechikdi");
  });
  it("says nothing without recorded minutes", () => {
    expect(lateMinutesText(null)).toBeNull();
    expect(lateMinutesText(undefined)).toBeNull();
    expect(lateMinutesText(0)).toBeNull();
  });
});
