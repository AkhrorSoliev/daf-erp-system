import { describe, expect, it } from "vitest";
import {
  isMobileDevice,
  lastSeenText,
  sortSessions,
  type ActiveSession,
} from "./sessions-model";

const row = (id: string, current = false): ActiveSession => ({
  id,
  device: "Chrome · macOS",
  ip: null,
  createdAt: "2026-10-18T05:00:00Z",
  lastUsedAt: "2026-10-18T06:00:00Z",
  current,
});

describe("sortSessions", () => {
  it("puts the current device first and keeps the server's order for the rest", () => {
    const sorted = sortSessions([row("a"), row("b"), row("me", true), row("c")]);
    expect(sorted.map((r) => r.id)).toEqual(["me", "a", "b", "c"]);
  });

  it("does not change the array it was given", () => {
    const input = [row("a"), row("me", true)];
    sortSessions(input);
    expect(input.map((r) => r.id)).toEqual(["a", "me"]);
  });
});

describe("lastSeenText", () => {
  const now = new Date("2026-10-18T12:00:00Z");

  it("says «Hozir faol» for a device seen in the last minutes", () => {
    expect(lastSeenText("2026-10-18T11:57:00Z", now)).toBe("Hozir faol");
  });

  it("falls back to the relative time after that", () => {
    expect(lastSeenText("2026-10-18T11:30:00Z", now)).toBe("30 daqiqa oldin");
  });

  it("names yesterday on the Tashkent clock", () => {
    // 11:00 UTC on the 17th is 16:00 Tashkent, the previous day.
    expect(lastSeenText("2026-10-17T11:00:00Z", now)).toBe("Kecha, 16:00");
  });
});

describe("isMobileDevice", () => {
  it("recognises phones, not desktops or unknown devices", () => {
    expect(isMobileDevice("Safari · iOS")).toBe(true);
    expect(isMobileDevice("Chrome · Android")).toBe(true);
    expect(isMobileDevice("Chrome · macOS")).toBe(false);
    expect(isMobileDevice("Noma'lum qurilma")).toBe(false);
  });
});
