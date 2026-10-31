import { describe, expect, it } from "vitest";
import { dayKey, summarizeUnusedSelection, type UnusedDay } from "./unused-departure-lessons-model";

const days: UnusedDay[] = [
  { enrollmentId: "enr-1", date: "2026-10-16", amount: 34_615 },
  { enrollmentId: "enr-1", date: "2026-10-19", amount: 34_615 },
  { enrollmentId: "enr-1", date: "2026-10-21", amount: 34_615 },
  { enrollmentId: "enr-1", date: "2026-10-23", amount: 34_615 },
  { enrollmentId: "enr-1", date: "2026-10-26", amount: 34_615 },
  { enrollmentId: "enr-1", date: "2026-10-28", amount: 34_615 },
  { enrollmentId: "enr-1", date: "2026-10-30", amount: 34_615 },
];

describe("summarizeUnusedSelection", () => {
  it("caps the total at the debt and zeroes the after-balance (#10882)", () => {
    const result = summarizeUnusedSelection(days, new Set(), -233_330);
    expect(result).toEqual({
      selectedCount: 7,
      selectedTotal: 233_330,
      rawTotal: 242_305,
      capped: true,
      afterBalance: 0,
    });
  });

  it("recomputes live when a day is unticked", () => {
    const off = new Set([dayKey(days[0])]);
    const result = summarizeUnusedSelection(days, off, -233_330);
    expect(result).toEqual({
      selectedCount: 6,
      selectedTotal: 207_690,
      rawTotal: 207_690,
      capped: false,
      afterBalance: -25_640,
    });
  });

  it("is never capped once the selection fits inside the debt", () => {
    const off = new Set(days.slice(2).map(dayKey));
    const result = summarizeUnusedSelection(days, off, -233_330);
    expect(result.capped).toBe(false);
    expect(result.selectedTotal).toBe(result.rawTotal);
  });

  it("selects nothing and owes nothing with a non-negative balance", () => {
    const result = summarizeUnusedSelection(days, new Set(), 0);
    expect(result.selectedTotal).toBe(0);
    expect(result.afterBalance).toBe(0);
  });

  it("with everything unticked, selects nothing", () => {
    const off = new Set(days.map(dayKey));
    const result = summarizeUnusedSelection(days, off, -233_330);
    expect(result).toEqual({
      selectedCount: 0,
      selectedTotal: 0,
      rawTotal: 0,
      capped: false,
      afterBalance: -233_330,
    });
  });
});
