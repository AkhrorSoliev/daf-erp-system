import { describe, expect, it } from "vitest";
import { shortDate } from "./covering-badge";

/**
 * The date is the point of this badge, so the formatting is worth pinning.
 * `2026-08-25` must read as 25 August in Tashkent — the string is a calendar
 * date, and running it through `new Date()` would hand it to the browser's
 * timezone and slide it a day in either direction.
 */
describe("covering badge date", () => {
  it("reads a lesson date as the day it says", () => {
    expect(shortDate("2026-08-25")).toBe("25-avg");
    expect(shortDate("2026-01-01")).toBe("1-yanv");
    expect(shortDate("2026-12-31")).toBe("31-dek");
  });

  it("does not slide across a timezone at the edges of the day", () => {
    // `new Date("2026-08-01")` is UTC midnight; west of UTC that is 31 July.
    // Tashkent is +5, so the naive version breaks the other way for anyone
    // testing from the Americas. Parsing the string avoids the question.
    expect(shortDate("2026-08-01")).toBe("1-avg");
    expect(shortDate("2026-03-31")).toBe("31-mart");
  });
});
