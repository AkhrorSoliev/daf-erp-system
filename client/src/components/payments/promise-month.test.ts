import { describe, expect, it } from "vitest";
import { capToRange, dateFromDay } from "./promise-month";

describe("promise date helpers (ADR-0072)", () => {
  it("a day is local midnight, the value a DatePicker bound takes", () => {
    expect(dateFromDay("2026-10-21")).toEqual(new Date(2026, 9, 21));
  });

  it("a default day is clamped into the allowed range", () => {
    const range = { from: "2026-10-14", to: "2026-10-21" };
    expect(capToRange(new Date(2026, 10, 2), range)).toEqual(new Date(2026, 9, 21));
    expect(capToRange(new Date(2026, 9, 10), range)).toEqual(new Date(2026, 9, 14));
    expect(capToRange(new Date(2026, 9, 16), range)).toEqual(new Date(2026, 9, 16));
    expect(capToRange(null, range)).toBeNull();
    expect(capToRange(new Date(2026, 10, 2), null)).toEqual(new Date(2026, 10, 2));
  });
});
