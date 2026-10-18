import { describe, expect, it } from "vitest";
import { monthLabel } from "./salary-utils";

describe("monthLabel", () => {
  it("keeps the Uzbek month name and the year by default", () => {
    expect(monthLabel("2026-06")).toBe("Iyun 2026");
    expect(monthLabel("2026-12")).toBe("Dekabr 2026");
  });

  it("lets the caller translate the month name and leaves the year alone", () => {
    const upper = (source: string) => source.toUpperCase();
    expect(monthLabel("2026-06", upper)).toBe("IYUN 2026");
  });
});
