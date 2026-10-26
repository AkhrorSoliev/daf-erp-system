import { describe, expect, it } from "vitest";
import { applyEdits, draftError, draftPatch, isDirty, toDraft } from "./chat-settings-draft";
import type { ChatAdminSettings } from "./chat-admin-types";

const saved: ChatAdminSettings = { enabled: false, weekMinutesActive: 30, weekMinutesRadio: 10 };

describe("chat settings draft", () => {
  it("starts from the saved values, minutes as text", () => {
    expect(toDraft(saved)).toEqual({ enabled: false, active: "30", radio: "10" });
  });

  it("is dirty only when something differs", () => {
    expect(isDirty(saved, toDraft(saved))).toBe(false);
    expect(isDirty(saved, { ...toDraft(saved), enabled: true })).toBe(true);
    expect(isDirty(saved, { ...toDraft(saved), active: "" })).toBe(true);
  });

  it.each(["", "1001", "-1", "1.5", "abc"])("refuses %j", (value) => {
    expect(draftError({ ...toDraft(saved), active: value })).not.toBeNull();
    expect(draftError({ ...toDraft(saved), radio: value })).not.toBeNull();
  });

  it("accepts the boundaries 0 and 1000", () => {
    expect(draftError({ ...toDraft(saved), active: "0", radio: "1000" })).toBeNull();
  });

  it("sends only the changed fields, minutes parsed", () => {
    expect(draftPatch(saved, { ...toDraft(saved), radio: "15" })).toEqual({ weekMinutesRadio: 15 });
  });

  it("sends the switch alone when only it changed", () => {
    expect(draftPatch(saved, { ...toDraft(saved), enabled: true })).toEqual({ enabled: true });
  });

  it("applyEdits: an unedited field follows a changed saved, an edited one keeps its edit", () => {
    const changed: ChatAdminSettings = { enabled: true, weekMinutesActive: 40, weekMinutesRadio: 20 };
    expect(applyEdits(changed, { radio: "15" })).toEqual({ enabled: true, active: "40", radio: "15" });
    expect(applyEdits(changed, null)).toEqual(toDraft(changed));
  });

  it("applyEdits keeps falsy edits (enabled false, 0, empty text)", () => {
    const on: ChatAdminSettings = { enabled: true, weekMinutesActive: 30, weekMinutesRadio: 10 };
    expect(applyEdits(on, { enabled: false, active: "0", radio: "" })).toEqual({
      enabled: false,
      active: "0",
      radio: "",
    });
  });

  it("sends nothing when nothing changed or a value is invalid", () => {
    expect(draftPatch(saved, toDraft(saved))).toBeNull();
    expect(draftPatch(saved, { ...toDraft(saved), active: "1001" })).toBeNull();
  });
});
