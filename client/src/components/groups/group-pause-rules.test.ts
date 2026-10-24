import { describe, expect, it } from "vitest";
import {
  EMPTY_PAUSE_CHOICE,
  pauseChoiceReady,
  pauseMode,
  pausePayload,
  resumePrefill,
  tomorrow,
} from "./group-pause-rules";

const day = new Date(2026, 10, 5);

describe("pauseMode", () => {
  it("pausing an active group, or opening a paused one", () => {
    expect(pauseMode("ACTIVE", "PAUSED")).toBe("pause");
    expect(pauseMode("PAUSED", "ACTIVE")).toBe("resume");
  });
  it("is null for every other change", () => {
    expect(pauseMode("ACTIVE", "COMPLETED")).toBeNull();
    expect(pauseMode("PAUSED", "CANCELLED")).toBeNull();
    expect(pauseMode("FORMING", "ACTIVE")).toBeNull();
  });
});

describe("pauseChoiceReady", () => {
  it("a pause needs a day or 'unknown', not both and not neither", () => {
    expect(pauseChoiceReady("pause", EMPTY_PAUSE_CHOICE)).toBe(false);
    expect(pauseChoiceReady("pause", { day, unknown: false })).toBe(true);
    expect(pauseChoiceReady("pause", { day: undefined, unknown: true })).toBe(true);
    expect(pauseChoiceReady("pause", { day, unknown: true })).toBe(false);
  });
  it("a resume needs the day", () => {
    expect(pauseChoiceReady("resume", EMPTY_PAUSE_CHOICE)).toBe(false);
    expect(pauseChoiceReady("resume", { day, unknown: false })).toBe(true);
  });
  it("other changes need nothing", () => {
    expect(pauseChoiceReady(null, EMPTY_PAUSE_CHOICE)).toBe(true);
  });
});

describe("pausePayload", () => {
  it("sends the planned day as YYYY-MM-DD", () => {
    expect(pausePayload("pause", { day, unknown: false })).toEqual({
      plannedResumeOn: "2026-11-05",
    });
  });
  it("sends 'unknown' without a day", () => {
    expect(pausePayload("pause", { day: undefined, unknown: true })).toEqual({
      resumeUnknown: true,
    });
  });
  it("sends the restart day for a resume", () => {
    expect(pausePayload("resume", { day, unknown: false })).toEqual({
      resumeOn: "2026-11-05",
    });
  });
  it("sends nothing for another change", () => {
    expect(pausePayload(null, { day, unknown: false })).toEqual({});
  });
});

describe("resumePrefill", () => {
  it("offers the confirmed day, else the planned one, else nothing", () => {
    expect(resumePrefill({ plannedResumeOn: "2026-11-05", resumeOn: null })?.getDate()).toBe(5);
    expect(resumePrefill({ plannedResumeOn: "2026-11-05", resumeOn: "2026-11-12" })?.getDate()).toBe(12);
    expect(resumePrefill({ plannedResumeOn: null, resumeOn: null })).toBeUndefined();
    expect(resumePrefill(null)).toBeUndefined();
  });
});

describe("tomorrow", () => {
  it("is the next local day at midnight", () => {
    expect(tomorrow(new Date(2026, 9, 31, 23, 59)).getDate()).toBe(1);
  });
});
