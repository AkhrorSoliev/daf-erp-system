import { describe, expect, it } from "vitest";
import {
  missedLessonDate,
  missedLessonsCount,
} from "./salary-missed-lessons-text";

describe("«Berilmadi» text", () => {
  it("writes the day as dd.MM.yyyy without touching time zones", () => {
    expect(missedLessonDate("2026-10-05")).toBe("05.10.2026");
  });

  it("counts the lessons", () => {
    expect(missedLessonsCount({ lessons: [], total: 0 })).toBe("0 ta dars");
  });
});
