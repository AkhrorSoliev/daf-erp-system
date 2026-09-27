import { describe, expect, it } from "vitest";
import { lessonWindowState, windowOpensAt } from "./lesson-window";

const lesson = { lessonDay: "2026-10-05", startTime: "15:00", endTime: "16:30" };

describe("lessonWindowState (mirror of the server rule)", () => {
  it("before, open, closed around the lesson", () => {
    expect(lessonWindowState({ ...lesson, now: new Date("2026-10-05T09:49:00Z") })).toBe("before");
    expect(lessonWindowState({ ...lesson, now: new Date("2026-10-05T09:50:00Z") })).toBe("open");
    expect(lessonWindowState({ ...lesson, now: new Date("2026-10-05T11:30:30Z") })).toBe("open");
    expect(lessonWindowState({ ...lesson, now: new Date("2026-10-05T11:31:00Z") })).toBe("closed");
  });

  it("past days are closed and future days are before", () => {
    expect(lessonWindowState({ ...lesson, now: new Date("2026-10-06T04:00:00Z") })).toBe("closed");
    expect(lessonWindowState({ ...lesson, now: new Date("2026-10-04T12:00:00Z") })).toBe("before");
  });

  it("a group without times is open all lesson day", () => {
    expect(
      lessonWindowState({
        lessonDay: "2026-10-05",
        startTime: null,
        endTime: null,
        now: new Date("2026-10-05T01:00:00Z"),
      }),
    ).toBe("open");
  });

  it("names the minute the window opens", () => {
    expect(windowOpensAt("15:00")).toBe("14:50");
    expect(windowOpensAt("09:05")).toBe("08:55");
  });
});
