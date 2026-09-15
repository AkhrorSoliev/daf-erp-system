import { describe, expect, it } from "vitest";
import { format } from "date-fns";
import { tashkentDayAsLocalDate } from "./tashkent-time";

// Group.startDate/endDate are Tashkent calendar days on the server
// (`tashkentDateStr`), but the stored instant is local midnight of whichever
// browser saved it — so one calendar day arrives in several shapes. Each must
// land on the same LOCAL day in any browser zone; run the suite under
// TZ=Europe/Berlin or TZ=Europe/Moscow to see why `new Date(stored)` is wrong.
const localDay = (d: Date) => format(d, "yyyy-MM-dd");

describe("tashkentDayAsLocalDate", () => {
  it.each([
    ["2026-09-09T19:00:00.000Z", "2026-09-10"], // saved from Tashkent (UTC+5)
    ["2026-09-11T21:00:00.000Z", "2026-09-12"], // saved from a UTC+3 browser
    ["2026-07-29T22:00:00.000Z", "2026-07-30"], // saved from a UTC+2 browser
    ["2026-05-01T00:00:00.000Z", "2026-05-01"], // calendar-date shape (ADR-0016)
  ])("%s → %s", (stored, day) => {
    expect(localDay(tashkentDayAsLocalDate(stored))).toBe(day);
  });

  it("returns local midnight, so a date picker selects exactly that day", () => {
    const d = tashkentDayAsLocalDate("2026-09-09T19:00:00.000Z");
    expect([d.getHours(), d.getMinutes(), d.getSeconds()]).toEqual([0, 0, 0]);
  });
});
