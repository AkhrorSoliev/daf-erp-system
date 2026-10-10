import { describe, expect, it } from "vitest";
import { format } from "date-fns";
import {
  tashkentDayAsLocalDate,
  tashkentDayNumber,
  tashkentDdMm,
  tashkentHhmm,
  tashkentInstantOn,
  tashkentNow,
  tashkentWallClock,
} from "./tashkent-time";

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

// A task deadline is picked as a day, but the server checks it as a Tashkent
// time (Monday–Saturday, 08:00–18:00). The picker's local midnight sent as-is
// was 00:00 in Tashkent (03:00 from a Berlin browser), so no deadline saved.
describe("tashkentInstantOn", () => {
  it("puts the picked day at that Tashkent hour, whatever the browser zone", () => {
    expect(tashkentInstantOn(new Date(2026, 9, 5), 18)).toBe("2026-10-05T13:00:00.000Z");
  });

  it("stays on the picked day in Tashkent and in the picker", () => {
    const sent = tashkentInstantOn(new Date(2026, 11, 31), 18);
    expect(tashkentNow(new Date(sent))).toMatchObject({
      dateStr: "2026-12-31",
      minutes: 18 * 60,
    });
    expect(localDay(tashkentDayAsLocalDate(sent))).toBe("2026-12-31");
  });
});

// The synchronous primitives lists use: a day, a clock and a date, all read on
// the Tashkent wall clock whatever zone the machine runs in.
describe("Tashkent day, clock and date", () => {
  it("shares a day number between two instants of one Tashkent day", () => {
    // 19:00Z is Tashkent midnight: the 18:59:59Z second is still the day before.
    expect(tashkentDayNumber("2026-10-09T19:00:00.000Z")).toBe(
      tashkentDayNumber("2026-10-10T18:59:59.000Z"),
    );
    expect(tashkentDayNumber("2026-10-09T18:59:59.000Z")).toBe(
      tashkentDayNumber("2026-10-09T19:00:00.000Z") - 1,
    );
  });

  it("accepts a Date as well as an ISO string", () => {
    const iso = "2026-10-07T13:00:00.000Z";
    expect(tashkentDayNumber(new Date(iso))).toBe(tashkentDayNumber(iso));
    expect(tashkentHhmm(new Date(iso))).toBe("18:00");
  });

  it("writes HH:mm and dd.MM on the Tashkent clock", () => {
    expect(tashkentHhmm("2026-10-07T13:00:00.000Z")).toBe("18:00");
    expect(tashkentHhmm("2026-10-07T19:05:00.000Z")).toBe("00:05");
    expect(tashkentDdMm("2026-10-07T18:59:59.000Z")).toBe("07.10");
    expect(tashkentDdMm("2026-10-07T19:00:00.000Z")).toBe("08.10");
  });

  it("moves the wall clock into the UTC getters", () => {
    const t = tashkentWallClock("2026-12-31T20:00:00.000Z");
    expect([t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), t.getUTCHours()]).toEqual([
      2027, 0, 1, 1,
    ]);
  });
});
