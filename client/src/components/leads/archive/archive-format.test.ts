import { describe, expect, it } from "vitest";
import { archiveDate } from "./archive-format";

describe("archiveDate", () => {
  it("prints the Toshkent wall clock, not the browser's", () => {
    expect(archiveDate("2026-10-17T19:30:00.000Z")).toBe("18.10.2026, 00:30");
    expect(archiveDate("2026-10-18T05:07:00.000Z")).toBe("18.10.2026, 10:07");
  });
  it("prints a dash for a missing date", () => {
    expect(archiveDate(null)).toBe("—");
  });
});
