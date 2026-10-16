import { describe, expect, it } from "vitest";
import { formatPrice } from "@/lib/format-utils";
import {
  dayText,
  deltaLine,
  compareText,
  deltaOrNull,
  deltaTone,
  kpiCompare,
  kpiMonth,
  ratioText,
  ruleError,
  settingsPatch,
  switchText,
} from "./kpi-format";
import type { KpiSettings } from "./kpi-types";

describe("kpiMonth / kpiCompare", () => {
  it("keeps the page month inside [2026-10, today's month]", () => {
    expect(kpiMonth("", "2026-11")).toBe("2026-11");
    expect(kpiMonth("2026-09", "2026-11")).toBe("2026-10");
    expect(kpiMonth("2026-12", "2026-11")).toBe("2026-11");
    expect(kpiMonth("bad", "2026-11")).toBe("2026-11");
  });

  it("compares with the month before unless one is picked", () => {
    expect(kpiCompare("", "2026-10")).toBe("2026-09");
    expect(kpiCompare("2026-08", "2026-11")).toBe("2026-09");
    expect(kpiCompare("2026-10", "2026-11")).toBe("2026-10");
  });

  it("never compares a month with itself or a later one", () => {
    expect(kpiCompare("2026-11", "2026-11")).toBe("2026-10");
    expect(kpiCompare("2026-12", "2026-11")).toBe("2026-10");
    expect(kpiCompare("2026-11", "2026-10")).toBe("2026-09");
  });
});

describe("deltaLine / deltaTone", () => {
  it("prints the arrow and the difference", () => {
    expect(deltaLine(5, 3, "count")).toBe("▲ 2");
    expect(deltaLine(3, 3, "count")).toBe("o'zgarmadi");
    expect(deltaLine(50_000, 70_000, "som")).toBe(`▼ ${formatPrice(20_000)} so'm`);
    expect(deltaLine(55, 50, "pct")).toBe("▲ 5 foiz punkt");
  });

  it("is green when better: more results, fewer returned leads", () => {
    expect(deltaTone(5, 3)).toBe("good");
    expect(deltaTone(3, 5)).toBe("bad");
    expect(deltaTone(5, 3, false)).toBe("bad");
    expect(deltaTone(3, 3)).toBe("flat");
  });

  it("prints nothing when the compare month has no KPI data or a figure is missing", () => {
    expect(deltaOrNull(5, 3, "count", true)).toBe("▲ 2");
    expect(deltaOrNull(5, 0, "count", false)).toBeNull();
    expect(deltaOrNull(null, 3, "pct", true)).toBeNull();
    expect(deltaOrNull(5, null, "pct", true)).toBeNull();
  });
});

describe("compareText", () => {
  it("adds the unit to the compare figure", () => {
    expect(compareText(5, "count")).toBe("5");
    expect(compareText(20_000, "som")).toBe(`${formatPrice(20_000)} so'm`);
    expect(compareText(55, "pct")).toBe("55%");
  });
});

describe("texts", () => {
  it("prints a share with its parts, or a dash", () => {
    expect(ratioText(50, 1, 2)).toBe("50% (1 / 2)");
    expect(ratioText(null, 0, 0)).toBe("—");
  });

  it("states the switch and when it flipped", () => {
    expect(switchText({ enabled: true, changedAt: null })).toBe("KPI hisoblash yoqilgan");
    expect(switchText({ enabled: false, changedAt: "2026-10-20T05:00:00.000Z" })).toBe(
      "KPI hisoblash o'chiq (20.10 dan)",
    );
  });

  it("prints a day as dd.MM.yyyy on the Tashkent clock", () => {
    expect(dayText("2026-10-19T20:30:00.000Z")).toBe("20.10.2026");
  });
});

describe("settings form", () => {
  const SAVED: KpiSettings = {
    enabled: true,
    changedAt: null,
    leadPaid: { mode: "FIXED", value: 50_000 },
    promiseKept: { mode: "FIXED", value: 20_000 },
  };

  it("refuses a percent over 100 and a sum over 10 000 000", () => {
    expect(ruleError({ mode: "PERCENT", value: 101 })).toBe("Foiz 0 dan 100 gacha bo'ladi");
    expect(ruleError({ mode: "FIXED", value: 10_000_001 })).toBe("Summa 10 000 000 so'mdan oshmasin");
    expect(ruleError({ mode: "FIXED", value: 1.5 })).toBe("Butun son kiriting");
    expect(ruleError({ mode: "FIXED", value: -5 })).toBe("Manfiy bo'lishi mumkin emas");
    expect(ruleError({ mode: "PERCENT", value: 5 })).toBeNull();
  });

  it("sends only what changed", () => {
    expect(settingsPatch(SAVED, SAVED)).toEqual({});
    expect(settingsPatch(SAVED, { ...SAVED, enabled: false })).toEqual({ enabled: false });
    expect(
      settingsPatch(SAVED, { ...SAVED, promiseKept: { mode: "PERCENT", value: 5 } }),
    ).toEqual({ promiseKept: { mode: "PERCENT", value: 5 } });
  });
});
