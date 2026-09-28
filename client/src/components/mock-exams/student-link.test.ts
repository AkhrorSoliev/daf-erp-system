import { describe, expect, it } from "vitest";
import {
  identityAfterLink,
  normalizeStudentSearch,
  type LinkableStudent,
} from "./student-link";

const aziz: LinkableStudent = {
  id: 10234,
  firstName: "Aziz",
  lastName: "Karimov",
  phone: "901234567",
  photo: null,
  status: "ACTIVE",
};

const dilnoza: LinkableStudent = {
  id: 10500,
  firstName: "Dilnoza",
  lastName: "Rahimova",
  phone: "935556677",
  photo: null,
  status: "ACTIVE",
};

const empty = { firstName: "", lastName: "", phone: "" };

describe("o'quvchi qidiruvi", () => {
  // Kartada raqam `901234567` bo'lib turadi; admin esa uni ko'pincha
  // `+998 90 123 45 67` deb yozadi — server `contains` bilan hech narsa
  // topmasdi.
  it("telefonni kartadagi ko'rinishga keltiradi", () => {
    expect(normalizeStudentSearch("+998 90 123 45 67")).toBe("901234567");
    expect(normalizeStudentSearch("998901234567")).toBe("901234567");
    expect(normalizeStudentSearch("90 123")).toBe("90123");
    expect(normalizeStudentSearch("(90) 123-45-67")).toBe("901234567");
  });

  // Qidiruv har harfda yuradi: `+998 90 123` hali to'liq raqam emas, lekin
  // `998` — davlat kodi. Uni qoldirganda o'quvchi to'liq raqam yozilguncha
  // topilmasdi.
  it("yozilayotgan xalqaro raqamdan ham davlat kodini oladi", () => {
    expect(normalizeStudentSearch("+998 90 123")).toBe("90123");
    expect(normalizeStudentSearch("+998")).toBe("");
  });

  // `99 812 34 56` — mahalliy raqam, `998` bilan boshlanadi.
  it("plyussiz qisqa raqamda 998 ni davlat kodi deb olmaydi", () => {
    expect(normalizeStudentSearch("99812")).toBe("99812");
    expect(normalizeStudentSearch("998123456")).toBe("998123456");
  });

  it("ID va ismga tegmaydi", () => {
    expect(normalizeStudentSearch(" 10234 ")).toBe("10234");
    expect(normalizeStudentSearch("  Aziz Karimov ")).toBe("Aziz Karimov");
  });
});

describe("o'quvchi tanlanganda forma", () => {
  it("ism, familya va telefon kartadan olinadi", () => {
    expect(identityAfterLink(empty, null, aziz)).toEqual({
      firstName: "Aziz",
      lastName: "Karimov",
      phone: "901234567",
    });
  });

  it("boshqa o'quvchi tanlansa, oldingisining ma'lumoti almashadi", () => {
    const filled = identityAfterLink(empty, null, aziz);
    expect(identityAfterLink(filled, aziz, dilnoza)).toEqual({
      firstName: "Dilnoza",
      lastName: "Rahimova",
      phone: "935556677",
    });
  });

  it("tanlov olib tashlansa kartadan kelgan qiymatlar tozalanadi", () => {
    const filled = identityAfterLink(empty, null, aziz);
    expect(identityAfterLink(filled, aziz, null)).toEqual(empty);
  });

  it("admin o'zgartirgan qiymat tanlov olib tashlanganda qoladi", () => {
    const edited = { firstName: "Aziz", lastName: "Karimov", phone: "977770000" };
    expect(identityAfterLink(edited, aziz, null)).toEqual({
      firstName: "",
      lastName: "",
      phone: "977770000",
    });
  });

  // Forma faqat 9 xonali raqamni qabul qiladi — xorijiy raqam formaga
  // tushsa, «Qo'shish» xato berardi.
  it("kartadagi xorijiy raqam formaga tushmaydi", () => {
    const foreign = { ...aziz, phone: "79161234567" };
    expect(
      identityAfterLink({ ...empty, phone: "901112233" }, null, foreign).phone,
    ).toBe("901112233");
  });
});
