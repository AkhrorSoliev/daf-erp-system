import { describe, expect, it } from "vitest";
import { archiveReason, capRows, isDetailType, personName } from "./archive-detail-rules";

describe("isDetailType", () => {
  it("faqat o'quvchi va guruh", () => {
    expect(isDetailType("students")).toBe(true);
    expect(isDetailType("groups")).toBe(true);
    expect(isDetailType("users")).toBe(false);
    expect(isDetailType("")).toBe(false);
  });
});

describe("archiveReason", () => {
  it("haqiqiy sababni qaytaradi (bo'shliqsiz)", () => {
    expect(archiveReason({ statusChangeReason: "  Boshqa markazga o'tdi " })).toBe(
      "Boshqa markazga o'tdi",
    );
  });
  it("bo'sh, null va standart «O'chirildi» — sabab yozilmagan", () => {
    expect(archiveReason({ statusChangeReason: "" })).toBeNull();
    expect(archiveReason({ statusChangeReason: "   " })).toBeNull();
    expect(archiveReason({ statusChangeReason: null })).toBeNull();
    expect(archiveReason({})).toBeNull();
    expect(archiveReason({ statusChangeReason: "O'chirildi" })).toBeNull();
  });
});

describe("personName", () => {
  it("ism va familiyani birlashtiradi", () => {
    expect(personName({ firstName: "Madina", lastName: "Karimova" })).toBe("Madina Karimova");
  });
  it("bo'sh bo'lsa Noma'lum", () => {
    expect(personName(null)).toBe("Noma'lum");
    expect(personName({ firstName: "", lastName: null })).toBe("Noma'lum");
  });
});

describe("capRows", () => {
  it("cap dan kam bo'lsa hammasini ko'rsatadi", () => {
    expect(capRows([1, 2, 3], 3)).toEqual({ shown: [1, 2, 3], hidden: 0 });
  });
  it("ortig'ini 'yana N ta' deb sanaydi (jami serverdan)", () => {
    const rows = Array.from({ length: 50 }, (_, i) => i);
    const r = capRows(rows, 63, 10);
    expect(r.shown).toHaveLength(10);
    expect(r.hidden).toBe(53);
  });
  it("jami ro'yxatdan kichik bo'lsa manfiy bermaydi", () => {
    expect(capRows([1, 2], 0, 10).hidden).toBe(0);
  });
});
