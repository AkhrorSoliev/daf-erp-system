import { describe, expect, it } from "vitest";
import { newAttendanceWindow } from "./attendance-window";

const lesson = { date: "2026-10-01", todayStr: "2026-10-01", startTime: "17:30", endTime: "19:00" };

describe("newAttendanceWindow", () => {
  it("matches the server: opens 10 minutes early, closes at the end minute", () => {
    expect(newAttendanceWindow({ ...lesson, nowMinutes: 17 * 60 + 19 })).toBe("BEFORE");
    expect(newAttendanceWindow({ ...lesson, nowMinutes: 17 * 60 + 20 })).toBe("OPEN");
    expect(newAttendanceWindow({ ...lesson, nowMinutes: 19 * 60 })).toBe("ENDED");
    expect(newAttendanceWindow({ ...lesson, date: "2026-09-30", nowMinutes: 600 })).toBe("NOT_TODAY");
  });

  it("takes the company's lead: 20 opens at start-20, like the server", () => {
    const lead20 = { ...lesson, opensMinutesBefore: 20 };
    // start-25 (17:05) and start-21 (17:09): still closed.
    expect(newAttendanceWindow({ ...lead20, nowMinutes: 17 * 60 + 5 })).toBe("BEFORE");
    expect(newAttendanceWindow({ ...lead20, nowMinutes: 17 * 60 + 9 })).toBe("BEFORE");
    // start-20 (17:10) opens it; start-15 (17:15) is open, though the default 10 is not.
    expect(newAttendanceWindow({ ...lead20, nowMinutes: 17 * 60 + 10 })).toBe("OPEN");
    expect(newAttendanceWindow({ ...lead20, nowMinutes: 17 * 60 + 15 })).toBe("OPEN");
    expect(newAttendanceWindow({ ...lesson, nowMinutes: 17 * 60 + 15 })).toBe("BEFORE");
    // The lead moves only the opening.
    expect(newAttendanceWindow({ ...lead20, nowMinutes: 19 * 60 })).toBe("ENDED");
  });

  it("a lead of 0 is a lead, not 'unset': opens at the start minute", () => {
    const lead0 = { ...lesson, opensMinutesBefore: 0 };
    expect(newAttendanceWindow({ ...lead0, nowMinutes: 17 * 60 + 29 })).toBe("BEFORE");
    expect(newAttendanceWindow({ ...lead0, nowMinutes: 17 * 60 + 30 })).toBe("OPEN");
  });
});
