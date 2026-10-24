import { describe, expect, it } from "vitest";
import { startDateLabel } from "./groups-cards";

describe("startDateLabel", () => {
  it("writes the group's start day as dd.MM.yyyy, from the first ten characters", () => {
    expect(startDateLabel("2026-11-03T00:00:00.000Z")).toBe("03.11.2026");
    // No time-zone arithmetic: a Tashkent-evening instant keeps its written day.
    expect(startDateLabel("2026-11-03T21:30:00.000Z")).toBe("03.11.2026");
  });

  it("says nothing when the group has no start date", () => {
    expect(startDateLabel(null)).toBeNull();
    expect(startDateLabel("")).toBeNull();
  });
});
