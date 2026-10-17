import { describe, expect, it } from "vitest";
import { formatNumber } from "@/lib/format-utils";
import {
  daysLabel, HEAT_CLASS, hourLabel, insightSentences, mlnText, pctText, scheduleText,
} from "./center-activity-format";

describe("center-activity-format", () => {
  it("pctText rounds to a whole percent and shows a dash for no answer", () => {
    expect(pctText(27.4)).toBe("27%");
    expect(pctText(69.6)).toBe("70%");
    expect(pctText(null)).toBe("—");
  });

  it("daysLabel and scheduleText use the short Uzbek day names", () => {
    expect(daysLabel(["monday", "wednesday", "friday"])).toBe("Du-Chor-Ju");
    expect(scheduleText({ days: ["tuesday", "thursday", "saturday"], start: "17:00" })).toBe("Se-Pay-Sha 17:00");
    expect(scheduleText({ days: ["monday"], start: null })).toBe("Du");
  });

  it("mlnText: whole millions from a million, so'm below", () => {
    expect(mlnText(93_000_000)).toBe("93 mln");
    expect(mlnText(93_400_000)).toBe("93 mln");
    expect(mlnText(450_000)).toBe(`${formatNumber(450_000)} so'm`);
    expect(mlnText(0)).toBe("0 so'm");
  });

  it("hourLabel pads the hour", () => {
    expect(hourLabel(8)).toBe("08");
    expect(hourLabel(21)).toBe("21");
  });

  it("insightSentences speaks Uzbek and names the days and the free rooms", () => {
    const s = insightSentences({
      quiet: [{ days: ["tuesday", "thursday", "saturday"], fromHour: 17, toHour: 22, freeMin: 8, freeMax: 9 }],
      busy: { days: ["monday", "wednesday", "friday"], fromHour: 15, toHour: 17, freeMin: 1, freeMax: 1 },
    });
    expect(s.quiet).toEqual(["Se-Pay-Sha 17:00–22:00 (8–9 xona bo'sh)"]);
    expect(s.busy).toBe("Du-Chor-Ju 15:00–17:00 (1 ta xona bo'sh)");
    expect(insightSentences({ quiet: [], busy: null })).toEqual({ quiet: [], busy: null });
  });

  it("heat classes avoid the Lumio-only colours and the english enum words", () => {
    const all = Object.values(HEAT_CLASS).join(" ");
    expect(all).not.toMatch(/amber|sky|hsl\(/);
    expect(Object.keys(HEAT_CLASS).sort()).toEqual(["green", "light", "red", "yellow"]);
  });
});
