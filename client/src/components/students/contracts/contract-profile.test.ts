import { describe, expect, it } from "vitest";
import { conflictFor, profileConflicts, profileUpdatesBody, unsettled } from "./contract-profile";
import type { CustomerDraft } from "./contract-rules";
import type { StudentProfile } from "./contract-profile";

const profile = (over: Partial<StudentProfile> = {}): StudentProfile => ({
  fullName: "Soliyev Ahror",
  birthDate: "1995-05-05",
  isMinor: false,
  phone: "901234567",
  telegram: "@ahror",
  passport: "AB1234567",
  address: "Namangan",
  parentName: "Soliyeva Malika",
  parentPhone: "907654321",
  ...over,
});

const draft = (over: Partial<CustomerDraft> = {}): CustomerDraft => ({
  kind: "SELF",
  kindOther: "",
  fullName: "Soliyev Ahror",
  birthDate: "1995-05-05",
  passport: "ab 1234567",
  address: "Namangan",
  phone: "901234567",
  telegram: "Ahror",
  email: "",
  ...over,
});

describe("profile conflicts", () => {
  it("sees no difference in spacing, case or @", () => {
    expect(profileConflicts(draft(), profile())).toEqual([]);
  });

  it("flags a different passport and the student phone", () => {
    const list = profileConflicts(draft({ passport: "AC7654321", phone: "911112233" }), profile());
    expect(list.map((c) => [c.field, c.profileValue, c.writable])).toEqual([
      ["passportSeries", "AB1234567", true],
      ["phone", "901234567", false],
    ]);
  });

  it("ignores an empty input or an empty profile field", () => {
    expect(conflictFor("passport", draft({ passport: "" }), profile())).toBeNull();
    expect(conflictFor("passport", draft({ passport: "AC1" }), profile({ passport: null }))).toBeNull();
  });

  it("maps a parent customer to the parent fields", () => {
    const list = profileConflicts(
      draft({ kind: "PARENT", fullName: "Soliyev Bahrom", phone: "907654321", passport: "ZZ1" }),
      profile(),
    );
    expect(list.map((c) => c.field)).toEqual(["parentName"]);
  });

  it("counts a difference settled once the admin chose the new value, never the phone", () => {
    const list = profileConflicts(draft({ passport: "AC7654321", phone: "911112233" }), profile());
    expect(unsettled(list, ["passportSeries"]).map((c) => c.field)).toEqual(["phone"]);
    expect(profileUpdatesBody(list, ["passportSeries", "address"])).toEqual(["passportSeries"]);
  });
});
