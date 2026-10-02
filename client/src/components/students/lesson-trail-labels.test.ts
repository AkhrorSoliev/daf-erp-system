import { describe, expect, it } from "vitest";
import { blockCount, blockTitle } from "./lesson-trail-labels";

describe("blockTitle", () => {
  it("names a month block by its month", () => {
    expect(
      blockTitle({ cycleSequenceNumber: null, month: "2026-10" }, "2026"),
    ).toBe("Oktabr");
  });

  it("adds the year to a month of another year", () => {
    expect(
      blockTitle({ cycleSequenceNumber: null, month: "2026-12" }, "2027"),
    ).toBe("Dekabr 2026");
  });

  it("keeps the pack-era cycle name", () => {
    expect(blockTitle({ cycleSequenceNumber: 3, month: null }, "2026")).toBe(
      "3-sikl",
    );
  });

  it("reads a block from an older server, with no month, as a cycle", () => {
    expect(blockTitle({ cycleSequenceNumber: 2 }, "2026")).toBe("2-sikl");
  });
});

describe("blockCount", () => {
  it("shows the share while the block is not full", () => {
    expect(blockCount(1, 13)).toBe("1/13 dars");
  });

  it("shows the count alone when full or when the size is unknown", () => {
    expect(blockCount(13, 13)).toBe("13 dars");
    expect(blockCount(5, null)).toBe("5 dars");
  });
});
