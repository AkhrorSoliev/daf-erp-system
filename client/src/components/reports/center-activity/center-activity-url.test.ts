import { describe, expect, it } from "vitest";
import { excelFileName, overviewParams, pageMonth } from "./center-activity-url";

describe("center-activity-url", () => {
  it("pageMonth clamps into 2026-05 .. current and falls back to current", () => {
    expect(pageMonth("", "2026-10")).toBe("2026-10");
    expect(pageMonth("2026-03", "2026-10")).toBe("2026-05");
    expect(pageMonth("2027-01", "2026-10")).toBe("2026-10");
    expect(pageMonth("abc", "2026-10")).toBe("2026-10");
    expect(pageMonth("2026-07", "2026-10")).toBe("2026-07");
  });

  it("overviewParams leaves out the current month and no branch", () => {
    expect(overviewParams({ oy: "", filial: 0 }, "2026-10")).toEqual({});
    expect(overviewParams({ oy: "2026-10", filial: 0 }, "2026-10")).toEqual({});
    expect(overviewParams({ oy: "2026-07", filial: 3 }, "2026-10")).toEqual({ oy: "2026-07", filial: 3 });
  });

  it("excelFileName names the month", () => {
    expect(excelFileName("2026-07")).toBe("markaz-faoliyati-2026-07.xlsx");
  });
});
