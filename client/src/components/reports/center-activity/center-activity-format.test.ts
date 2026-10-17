import { describe, expect, it } from "vitest";
import { formatNumber } from "@/lib/format-utils";
import {
  daysLabel, HEAT_CLASS, heatDetail, hourLabel, insightSentences, mlnText, pctText, scheduleText,
} from "./center-activity-format";
import type { Heat } from "./center-activity-types";

const HEAT: Heat = {
  rooms: 3,
  roomList: [
    { id: "a", name: "1-xona", capacity: 14 },
    { id: "b", name: "2-xona", capacity: null },
    { id: "c", name: "3-xona", capacity: 10 },
  ],
  days: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"],
  hours: [9, 10],
  cells: [
    [
      { free: 1, tone: "light", busy: [{ room: 0, groups: ["Standart-04", "A1-07"] }, { room: 2, groups: ["B1-02"] }] },
      { free: 3, tone: "green", busy: [] },
    ],
    ...Array.from({ length: 5 }, () => [
      { free: 0, tone: "red" as const, busy: [0, 1, 2].map((room) => ({ room, groups: ["G"] })) },
      { free: 3, tone: "green" as const, busy: [] },
    ]),
  ],
};

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

  it("heatDetail splits the rooms into free and busy for one cell, in room order", () => {
    const d = heatDetail(HEAT, "monday", 9)!;
    expect(d.title).toBe("Dushanba, 09:00–10:00 — 1 ta xona bo'sh");
    expect(d.free).toEqual([{ id: "b", text: "2-xona" }]);
    expect(d.busy).toEqual([
      { id: "a", name: "1-xona", groups: "Standart-04, A1-07" },
      { id: "c", name: "3-xona", groups: "B1-02" },
    ]);
  });

  it("heatDetail: a capacity shows as «o'rin», no free room gives an empty list, a free hour has no busy rooms", () => {
    const free = heatDetail(HEAT, "monday", 10)!;
    expect(free.free.map((f) => f.text)).toEqual(["1-xona · 14 o'rin", "2-xona", "3-xona · 10 o'rin"]);
    expect(free.busy).toEqual([]);
    expect(free.title).toBe("Dushanba, 10:00–11:00 — 3 ta xona bo'sh");
    const full = heatDetail(HEAT, "saturday", 9)!;
    expect(full.free).toEqual([]);
    expect(full.title).toBe("Shanba, 09:00–10:00 — 0 ta xona bo'sh");
  });

  it("heatDetail: free + busy = every room, and a cell outside this heat gives null", () => {
    for (const day of HEAT.days) {
      for (const h of HEAT.hours) {
        const d = heatDetail(HEAT, day, h)!;
        expect(d.free.length + d.busy.length).toBe(HEAT.roomList.length);
      }
    }
    expect(heatDetail(HEAT, "monday", 8)).toBeNull();
    expect(heatDetail({ ...HEAT, days: [], hours: [] }, "monday", 9)).toBeNull();
  });
});
