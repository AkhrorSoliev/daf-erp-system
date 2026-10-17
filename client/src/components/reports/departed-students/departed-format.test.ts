import { describe, expect, it } from "vitest";
import { STATE_LABEL, capitalize, formatDay, formatPer100, formatShare, formatStudyMonths, monthFull, monthShort, previousLabel, rangeLabel } from "./departed-format";

describe("formatPer100", () => {
  it("below 10 one decimal with a comma, from 10 whole, no data a dash", () => {
    expect(formatPer100(4.5)).toBe("4,5");
    expect(formatPer100(4)).toBe("4,0");
    expect(formatPer100(0)).toBe("0,0");
    expect(formatPer100(12)).toBe("12");
    expect(formatPer100(12.4)).toBe("12");
    expect(formatPer100(10)).toBe("10");
    expect(formatPer100(null)).toBe("—");
  });
  it("a value that rounds up to 10 reads «10», not «10,0»", () => {
    expect(formatPer100(9.96)).toBe("10");
  });
});

describe("formatStudyMonths", () => {
  it("one decimal with a comma and «oy»; no data a dash", () => {
    expect(formatStudyMonths(3.4)).toBe("3,4 oy");
    expect(formatStudyMonths(3)).toBe("3,0 oy");
    expect(formatStudyMonths(null)).toBe("—");
  });
});

describe("previousLabel", () => {
  it("a month preset names the month before, in the locative", () => {
    expect(previousLabel("current_month", { startDate: "2026-09-01" })).toBe("sentabrda");
    expect(previousLabel("last_month", { startDate: "2026-08-01" })).toBe("avgustda");
  });
  it("covers every month", () => {
    const names = ["yanvarda", "fevralda", "martda", "aprelda", "mayda", "iyunda", "iyulda", "avgustda", "sentabrda", "oktabrda", "noyabrda", "dekabrda"];
    names.forEach((name, i) => {
      const m = String(i + 1).padStart(2, "0");
      expect(previousLabel("current_month", { startDate: `2026-${m}-01` })).toBe(name);
    });
  });
  it("3m and 6m say how many months, anything else says «oldingi davrda»", () => {
    expect(previousLabel("3m", { startDate: "2026-05-01" })).toBe("oldingi 3 oyda");
    expect(previousLabel("6m", { startDate: "2026-05-01" })).toBe("oldingi 6 oyda");
    expect(previousLabel("range", { startDate: "2026-05-03" })).toBe("oldingi davrda");
    // An unknown preset resolves to this month (cleanPreset), so it is labelled like one.
    expect(previousLabel("nonsense", { startDate: "2026-08-01" })).toBe("avgustda");
  });
  it("a legacy 12m link reads like 6m", () => {
    expect(previousLabel("12m", { startDate: "2026-05-03" })).toBe("oldingi 6 oyda");
  });
});

describe("STATE_LABEL", () => {
  it("names the three states", () => {
    expect(STATE_LABEL).toEqual({ ketgan: "Ketgan", kutilmoqda: "Kutilmoqda", qaytgan: "Qaytgan" });
  });
});

describe("formatDay", () => {
  it("dd.MM.yyyy on the Tashkent day", () => {
    expect(formatDay("2026-10-17T10:00:00.000Z")).toBe("17.10.2026");
    // 20:00 UTC is already the next day in Tashkent (UTC+5).
    expect(formatDay("2026-10-17T20:00:00.000Z")).toBe("18.10.2026");
  });
});

describe("rangeLabel", () => {
  it("a one-month range names the month, a longer one says «shu davrda»", () => {
    expect(rangeLabel({ startDate: "2026-09-01", endDate: "2026-09-30" })).toBe("sentabrda");
    expect(rangeLabel({ startDate: "2026-09-03", endDate: "2026-09-12" })).toBe("sentabrda");
    expect(rangeLabel({ startDate: "2026-07-01", endDate: "2026-09-30" })).toBe("shu davrda");
  });
});

describe("month names and capitalize", () => {
  it("short and full names from a «YYYY-MM» key", () => {
    expect(monthShort("2026-09")).toBe("sen");
    expect(monthShort("2026-01")).toBe("yan");
    expect(monthFull("2026-08")).toBe("avgust");
    expect(capitalize("sentabrda")).toBe("Sentabrda");
  });
});

describe("formatShare", () => {
  it("a percentage with a comma, a whole number without a decimal; no share a dash", () => {
    expect(formatShare(12.5)).toBe("12,5%");
    expect(formatShare(8)).toBe("8%");
    expect(formatShare(0)).toBe("0%");
    expect(formatShare(null)).toBe("—");
  });
});
