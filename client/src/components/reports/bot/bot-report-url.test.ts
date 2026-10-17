import { describe, expect, it } from "vitest";
import { listParams, pageMonth } from "./bot-report-url";

describe("bot-report-url", () => {
  it("pageMonth clamps into 2026-05 .. current and falls back to current", () => {
    expect(pageMonth("", "2026-10")).toBe("2026-10");
    expect(pageMonth("2026-03", "2026-10")).toBe("2026-05");
    expect(pageMonth("2027-01", "2026-10")).toBe("2026-10");
    expect(pageMonth("abc", "2026-10")).toBe("2026-10");
    expect(pageMonth("2026-07", "2026-10")).toBe("2026-07");
  });

  it("listParams always names the month and cleans page and size", () => {
    expect(listParams({ oy: "", page: 1, pageSize: 10 }, "2026-10")).toEqual({
      month: "2026-10",
      page: 1,
      pageSize: 10,
    });
    expect(listParams({ oy: "2026-07", page: 3, pageSize: 50 }, "2026-10")).toEqual({
      month: "2026-07",
      page: 3,
      pageSize: 50,
    });
    expect(listParams({ oy: "2026-07", page: 0, pageSize: 7 }, "2026-10")).toEqual({
      month: "2026-07",
      page: 1,
      pageSize: 10,
    });
  });
});
