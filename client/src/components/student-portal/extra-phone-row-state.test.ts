import { describe, expect, it } from "vitest";
import { extraPhoneRowState } from "./extra-phone-row-state";

// ADR-0070: one row on Profile. What it says depends on whether the student
// has a backup number and whether the SMS door is open.
describe("extraPhoneRowState", () => {
  it("is hidden until the status answers", () => {
    expect(extraPhoneRowState(undefined)).toBeNull();
  });

  it("offers to add when there is none and the door is open", () => {
    expect(extraPhoneRowState({ phone: null, editable: true })).toEqual({
      value: "Qo'shilmagan",
      actions: ["add"],
      note: null,
    });
  });

  it("shows the number with change and remove, and says what it is for", () => {
    expect(extraPhoneRowState({ phone: "935554433", editable: true })).toEqual({
      value: "+998 93 555 44 33",
      actions: ["change", "remove"],
      note: "Bu raqam bilan ham tizimga kira olasiz. Parolni tiklash kodi faqat asosiy raqamga boradi.",
    });
  });

  it("is read-only while the door is closed", () => {
    expect(extraPhoneRowState({ phone: null, editable: false })).toEqual({
      value: "Qo'shilmagan",
      actions: [],
      note: "Zaxira raqamni administrator qo'shadi.",
    });
    expect(extraPhoneRowState({ phone: "935554433", editable: false })).toEqual({
      value: "+998 93 555 44 33",
      actions: [],
      note: "Bu raqam bilan ham tizimga kira olasiz. Parolni tiklash kodi faqat asosiy raqamga boradi.",
    });
  });
});
