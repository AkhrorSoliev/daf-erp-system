import { describe, expect, it } from "vitest";
import {
  actorName,
  describeEntry,
  formatStamp,
  lastChangeText,
  type AbsencePauseHistoryEntry,
} from "./absence-pause-history";

function entry(over: Partial<AbsencePauseHistoryEntry>): AbsencePauseHistoryEntry {
  return {
    id: "h1",
    action: "UPDATE",
    createdAt: "2026-10-18T09:32:07.000Z",
    oldValues: {},
    newValues: {},
    changedBy: { id: 10001, firstName: "Ahror", lastName: "Soliyev" },
    ...over,
  };
}

describe("formatStamp", () => {
  it("prints the Tashkent clock (UTC+5), not the browser's", () => {
    expect(formatStamp("2026-10-18T09:32:07.000Z")).toBe("18.10.2026, 14:32");
    expect(formatStamp("2026-10-18T09:32:07.000Z", true)).toBe("18.10.2026, 14:32:07");
  });
  it("rolls into the next Tashkent day after 19:00 UTC", () => {
    expect(formatStamp("2026-10-18T20:05:00.000Z")).toBe("19.10.2026, 01:05");
  });
});

describe("actorName", () => {
  it("shortens the surname to an initial", () => {
    expect(actorName(entry({}))).toBe("Ahror S.");
  });
  it("names the system when nobody changed it", () => {
    expect(actorName(entry({ changedBy: null }))).toBe("Tizim");
  });
  it("copes with an empty surname", () => {
    expect(actorName(entry({ changedBy: { id: 1, firstName: "Ahror", lastName: " " } }))).toBe("Ahror");
  });
});

describe("describeEntry", () => {
  it("reads a switch-on", () => {
    expect(describeEntry(entry({ oldValues: { enabled: false }, newValues: { enabled: true } }))).toEqual({
      kind: "on",
      title: "Yoqildi",
      detail: null,
    });
  });
  it("reads a switch-off", () => {
    expect(describeEntry(entry({ oldValues: { enabled: true }, newValues: { enabled: false } }))).toMatchObject({
      kind: "off",
      title: "O'chirildi",
    });
  });
  it("lists the threshold changes with old and new values", () => {
    expect(
      describeEntry(entry({ oldValues: { pauseThreshold: 3 }, newValues: { pauseThreshold: 4 } })),
    ).toEqual({ kind: "edit", title: "Chegaralar o'zgardi", detail: "Pauza chegarasi 3 → 4" });
  });
  it("keeps the thresholds in the detail of a switch change", () => {
    const r = describeEntry(
      entry({
        oldValues: { enabled: false, warnThreshold: 2, dailyCap: 10 },
        newValues: { enabled: true, warnThreshold: 1, dailyCap: 20 },
      }),
    );
    expect(r.title).toBe("Yoqildi");
    expect(r.detail).toBe("Xabar chegarasi 2 → 1; Kunlik chegara 10 → 20");
  });
});

describe("lastChangeText", () => {
  it("joins what, who and when", () => {
    expect(
      lastChangeText(entry({ oldValues: { enabled: false }, newValues: { enabled: true } })),
    ).toBe("Yoqildi · Ahror S. · 18.10.2026, 14:32");
  });
});
