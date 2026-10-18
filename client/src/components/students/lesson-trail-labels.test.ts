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

// A marker `t` shows which text was handed over for translation.
const mark = (source: string, params?: Record<string, string | number>) =>
  `T(${source}${params ? JSON.stringify(params) : ""})`;

describe("blockTitle with a translator", () => {
  it("translates the month name and keeps the year", () => {
    expect(
      blockTitle({ cycleSequenceNumber: null, month: "2026-12" }, "2027", mark),
    ).toBe("T(Dekabr) 2026");
    expect(
      blockTitle({ cycleSequenceNumber: null, month: "2026-10" }, "2026", mark),
    ).toBe("T(Oktabr)");
  });

  it("hands the cycle number over as a placeholder", () => {
    expect(blockTitle({ cycleSequenceNumber: 3, month: null }, "2026", mark)).toBe(
      'T({n}-sikl{"n":3})',
    );
  });
});

describe("blockCount with a translator", () => {
  it("hands the figures over as placeholders", () => {
    expect(blockCount(1, 13, mark)).toBe(
      'T({n}/{capacity} dars{"n":1,"capacity":13})',
    );
    expect(blockCount(13, 13, mark)).toBe('T({n} dars{"n":13})');
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
