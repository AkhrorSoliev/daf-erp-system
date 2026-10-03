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
      {
        key: "phone",
        label: "Asosiy",
        phone: "901234567",
        signIn: true,
        telHref: "tel:+998901234567",
      },
      {
        key: "extraPhone",
        label: "Zaxira",
        phone: "935554433",
        signIn: true,
        telHref: "tel:+998935554433",
      },
      {
        key: "parentPhone",
        label: "Ota-ona",
        phone: "901112233",
        signIn: false,
        telHref: "tel:+998901112233",
      },
    ]);
  });

  it("leaves empty numbers out", () => {
    expect(
      studentPhoneRows({ phone: "901234567", extraPhone: null, parentPhone: null }),
    ).toEqual([
      {
        key: "phone",
        label: "Asosiy",
        phone: "901234567",
        signIn: true,
        telHref: "tel:+998901234567",
      },
    ]);
  });

  it("leaves an empty-string number out too", () => {
    expect(
      studentPhoneRows({ phone: "901234567", extraPhone: "", parentPhone: "" }).map(
        (r) => r.key,
      ),
    ).toEqual(["phone"]);
  });

  // parentPhone is not validated on the server: a stored country code must not
  // double up in the link.
  it("builds the link from the last nine digits", () => {
    const rows = studentPhoneRows({
      phone: "901234567",
      extraPhone: null,
      parentPhone: "998901112233",
    });
    expect(rows[1].telHref).toBe("tel:+998901112233");
  });
});
