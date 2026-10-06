import { describe, expect, it } from "vitest";
import { format } from "date-fns";
import {
  activePreset,
  comparisonLabel,
  presetRange,
} from "./payment-report-period";

const day = (d: Date) => format(d, "yyyy-MM-dd");
const range = (r: { start: Date; end: Date }) => [day(r.start), day(r.end)];

// Seshanba, 06.10.2026, kunning o'rtasi — vaqt qismi natijaga ta'sir qilmasin.
const tuesday = new Date(2026, 9, 6, 15, 30);
const monday = new Date(2026, 9, 5, 9, 0);
const sunday = new Date(2026, 9, 11, 22, 0);

describe("presetRange", () => {
  it("Bugun — faqat bugungi kun", () => {
    expect(range(presetRange("today", tuesday))).toEqual([
      "2026-10-06",
      "2026-10-06",
    ]);
  });

  it("Kecha — faqat kechagi kun, oy chegarasidan o'tib ham", () => {
    expect(range(presetRange("yesterday", tuesday))).toEqual([
      "2026-10-05",
      "2026-10-05",
    ]);
    expect(range(presetRange("yesterday", new Date(2026, 9, 1)))).toEqual([
      "2026-09-30",
      "2026-09-30",
    ]);
  });

  it("Shu hafta — dushanbadan bugungacha", () => {
    expect(range(presetRange("thisWeek", tuesday))).toEqual([
      "2026-10-05",
      "2026-10-06",
    ]);
    expect(range(presetRange("thisWeek", sunday))).toEqual([
      "2026-10-05",
      "2026-10-11",
    ]);
    expect(range(presetRange("thisWeek", monday))).toEqual([
      "2026-10-05",
      "2026-10-05",
    ]);
  });
});

describe("activePreset", () => {
  it("oraliq tugma kunlariga teng bo'lsa, o'sha tugmani qaytaradi", () => {
    const week = presetRange("thisWeek", tuesday);
    expect(activePreset(week.start, week.end, tuesday)).toBe("thisWeek");
    const y = presetRange("yesterday", tuesday);
    expect(activePreset(y.start, y.end, tuesday)).toBe("yesterday");
  });

  it("dushanba kuni «Bugun» va «Shu hafta» bir xil — «Bugun» tanlanadi", () => {
    const r = presetRange("thisWeek", monday);
    expect(activePreset(r.start, r.end, monday)).toBe("today");
  });

  it("boshqa oraliq yoki oraliq yo'q bo'lsa — null", () => {
    expect(
      activePreset(new Date(2026, 8, 1), new Date(2026, 8, 30), tuesday),
    ).toBeNull();
    expect(activePreset(null, null, tuesday)).toBeNull();
    expect(activePreset(new Date(2026, 9, 6), null, tuesday)).toBeNull();
  });
});

describe("comparisonLabel", () => {
  it("bir kun", () => {
    expect(
      comparisonLabel(
        { startDate: "2026-10-05", endDate: "2026-10-05" },
        tuesday,
      ),
    ).toBe("05.10 bilan solishtirganda");
  });

  it("bir necha kun", () => {
    expect(
      comparisonLabel(
        { startDate: "2026-08-02", endDate: "2026-08-31" },
        tuesday,
      ),
    ).toBe("02.08–31.08 bilan solishtirganda");
  });

  it("yil boshqa bo'lsa yoki oraliq ikki yilga tushsa — yil bilan", () => {
    expect(
      comparisonLabel(
        { startDate: "2025-12-01", endDate: "2025-12-31" },
        tuesday,
      ),
    ).toBe("01.12.2025–31.12.2025 bilan solishtirganda");
    expect(
      comparisonLabel(
        { startDate: "2025-12-29", endDate: "2026-01-04" },
        new Date(2026, 0, 6),
      ),
    ).toBe("29.12.2025–04.01.2026 bilan solishtirganda");
  });
});
