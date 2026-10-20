import { describe, expect, it } from "vitest";
import { draftError, draftPatch, isDirty, toDraft, type ParticipationSettings } from "./participation-settings-draft";

const saved: ParticipationSettings = {
  minAttendancePercent: 80,
  minAppPercent: { A1: 100, A2: 100, B1: 100 },
  minLessons: 20,
  maxLatePercent: 20,
};

describe("participation settings draft", () => {
  it("is dirty only when the text differs from the saved numbers", () => {
    expect(isDirty(saved, toDraft(saved))).toBe(false);
    expect(isDirty(saved, { ...toDraft(saved), maxLate: "" })).toBe(true);
    expect(isDirty(saved, { ...toDraft(saved), maxLate: "25" })).toBe(true);
  });

  it("starts from the saved numbers as text", () => {
    expect(toDraft(saved)).toEqual({
      attendance: "80",
      A1: "100",
      A2: "100",
      B1: "100",
      minLessons: "20",
      maxLate: "20",
    });
  });

  it("sends only what changed", () => {
    const draft = { ...toDraft(saved), attendance: "75", B1: "90" };
    expect(draftPatch(saved, draft)).toEqual({
      minAttendancePercent: 75,
      minAppPercent: { B1: 90 },
    });
  });

  it("sends nothing when nothing changed", () => {
    expect(draftPatch(saved, toDraft(saved))).toBeNull();
  });

  it.each(["", "abc", "101", "-1", "7.5"])("refuses %j", (value) => {
    expect(draftError({ ...toDraft(saved), attendance: value })).not.toBeNull();
  });

  it("accepts 0 and 100", () => {
    expect(draftError({ ...toDraft(saved), attendance: "0", A1: "100" })).toBeNull();
  });

  describe("minimum lessons", () => {
    it.each(["1", "20", "200"])("accepts %j", (value) => {
      expect(draftError({ ...toDraft(saved), minLessons: value })).toBeNull();
    });

    it.each(["", "0", "201", "-5", "19.5", "abc", "1000"])("refuses %j with its own text", (value) => {
      expect(draftError({ ...toDraft(saved), minLessons: value })).toBe(
        "Eng kam dars soni 1 dan 200 gacha butun son bo'lishi kerak",
      );
    });

    it("sends the new number alone", () => {
      expect(draftPatch(saved, { ...toDraft(saved), minLessons: "25" })).toEqual({ minLessons: 25 });
    });

    it("sends nothing for the number it already has", () => {
      expect(draftPatch(saved, { ...toDraft(saved), minLessons: " 20 " })).toBeNull();
    });
  });

  describe("lateness limit", () => {
    it.each(["0", "20", "100"])("accepts %j", (value) => {
      expect(draftError({ ...toDraft(saved), maxLate: value })).toBeNull();
    });

    it.each(["", "101", "-1", "20.5", "abc"])("refuses %j with its own text", (value) => {
      expect(draftError({ ...toDraft(saved), maxLate: value })).toBe(
        "Kech qolish chegarasi 0 dan 100 gacha butun son bo'lishi kerak",
      );
    });

    it("sends a 0 limit (nothing late is allowed), not 'nothing changed'", () => {
      expect(draftPatch(saved, { ...toDraft(saved), maxLate: "0" })).toEqual({ maxLatePercent: 0 });
    });
  });

  it("sends all of it together, keyed like the server DTO", () => {
    const draft = { attendance: "70", A1: "90", A2: "100", B1: "100", minLessons: "24", maxLate: "10" };
    expect(draftPatch(saved, draft)).toEqual({
      minAttendancePercent: 70,
      minAppPercent: { A1: 90 },
      minLessons: 24,
      maxLatePercent: 10,
    });
  });
});
