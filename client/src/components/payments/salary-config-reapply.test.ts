import { describe, expect, it } from "vitest";
import {
  needsReapplyConfirmation,
  reapplyLines,
  savedToastText,
  type RateReapplySummary,
} from "./salary-config-reapply";

const none: RateReapplySummary = {
  lessons: 0,
  before: 0,
  after: 0,
  delta: 0,
  settled: 0,
  unpriced: 0,
};
// #072, September 2026: 24 lessons at 9 524, re-priced to 16 429.
const g072: RateReapplySummary = {
  ...none,
  lessons: 24,
  before: 228_576,
  after: 394_296,
  delta: 165_720,
};

const nbsp = (s: string) => s.replace(/ /g, " ");

describe("salary-config-reapply", () => {
  it("asks only when past lessons are reached", () => {
    expect(needsReapplyConfirmation(none)).toBe(false);
    expect(needsReapplyConfirmation(g072)).toBe(true);
    expect(needsReapplyConfirmation({ ...none, settled: 3 })).toBe(true);
  });

  it("states the lessons, before, after and the difference", () => {
    const { main, notes } = reapplyLines(g072, "24.09.2026");
    expect(nbsp(main!)).toBe(
      "24.09.2026 dan beri yozilgan 24 ta dars yangi stavka bilan qayta hisoblanadi: 228 576 → 394 296 so'm (+165 720 so'm).",
    );
    expect(notes).toEqual([]);
  });

  it("says what is left as it is", () => {
    const { main, notes } = reapplyLines(
      { ...none, settled: 5, unpriced: 2 },
      "01.09.2026",
    );
    expect(main).toBeNull();
    expect(notes).toHaveLength(2);
    expect(notes[0]).toContain("5 ta dars");
    expect(notes[1]).toContain("2 ta dars");
  });

  it("marks a cut with a minus", () => {
    const { main } = reapplyLines(
      { ...none, lessons: 2, before: 20_000, after: 12_000, delta: -8_000 },
      "01.10.2026",
    );
    expect(nbsp(main!)).toContain("(-8 000 so'm)");
  });

  it("adds the re-priced lessons to the toast only when there are any", () => {
    expect(savedToastText("Oylik qoidasi saqlandi", none)).toBe(
      "Oylik qoidasi saqlandi",
    );
    expect(savedToastText("Oylik qoidasi saqlandi", undefined)).toBe(
      "Oylik qoidasi saqlandi",
    );
    expect(nbsp(savedToastText("Oylik qoidasi saqlandi", g072))).toBe(
      "Oylik qoidasi saqlandi. 24 ta dars qayta hisoblandi (+165 720 so'm)",
    );
  });
});
