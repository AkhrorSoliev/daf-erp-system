import { describe, expect, it } from "vitest";
import { draftError, draftPatch, toDraft, type ParticipationSettings } from "./participation-settings-draft";

const saved: ParticipationSettings = {
  minAttendancePercent: 80,
  minAppPercent: { A1: 100, A2: 100, B1: 100 },
};

describe("participation settings draft", () => {
  it("starts from the saved numbers as text", () => {
    expect(toDraft(saved)).toEqual({ attendance: "80", A1: "100", A2: "100", B1: "100" });
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
});
