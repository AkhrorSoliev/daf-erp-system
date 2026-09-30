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
});
