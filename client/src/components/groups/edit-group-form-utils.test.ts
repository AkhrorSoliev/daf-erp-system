import { describe, expect, it } from "vitest";
import { toApiDateStr } from "./edit-group-form-utils";

// The DatePicker hands the form a Date at LOCAL midnight of the picked day.
// The API reads Group.startDate through `utcMidnightFromDateStr`, which takes
// a 'YYYY-MM-DD' calendar date (ADR-0016) — `toISOString()` of that Date is
// 19:00 UTC of the PREVIOUS day in Tashkent, and the helper turns such a
// string into an Invalid Date. Every group create returned 500 from
// 10.09.2026 until the form sent the calendar day instead.
describe("toApiDateStr", () => {
  it("sends the picked calendar day, not the UTC instant", () => {
    const picked = new Date(2026, 8, 14); // 14.09.2026, local midnight
    expect(toApiDateStr(picked)).toBe("2026-09-14");
  });

  it("uses local day parts, so a Tashkent evening stays on its own day", () => {
    const eveningTashkent = new Date(2026, 8, 30, 23, 30);
    expect(toApiDateStr(eveningTashkent)).toBe("2026-09-30");
  });

  it("has the exact 'YYYY-MM-DD' shape the API accepts", () => {
    expect(toApiDateStr(new Date(2026, 0, 5))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
