import { describe, expect, it } from "vitest";
import { studentPhoneRows } from "./student-phone-rows";

// ADR-0067: the card shows every number the student has, each named, and says
// which of them open the portal. An empty one is not drawn.
describe("studentPhoneRows", () => {
  it("names all three and marks the two sign-in keys", () => {
    expect(
      studentPhoneRows({
        phone: "901234567",
        extraPhone: "935554433",
        parentPhone: "901112233",
      }),
    ).toEqual([
      { key: "phone", label: "Asosiy", phone: "901234567", signIn: true },
      { key: "extraPhone", label: "Zaxira", phone: "935554433", signIn: true },
      { key: "parentPhone", label: "Ota-ona", phone: "901112233", signIn: false },
    ]);
  });

  it("leaves empty numbers out", () => {
    expect(
      studentPhoneRows({ phone: "901234567", extraPhone: null, parentPhone: null }),
    ).toEqual([
      { key: "phone", label: "Asosiy", phone: "901234567", signIn: true },
    ]);
  });
});
