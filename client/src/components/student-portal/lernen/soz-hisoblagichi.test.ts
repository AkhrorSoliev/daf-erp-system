import { describe, expect, it } from "vitest";
import { sozHisoblagichi } from "./soz-hisoblagichi";

describe("sozHisoblagichi — seen / total words of a section (ADR-0071)", () => {
  it("shows how many words are met and how many are left", () => {
    expect(sozHisoblagichi({ jami: 28, gesehen: 14 })).toEqual({
      matn: "So'zlar: 14 / 28",
      foiz: 50,
      qoldi: 14,
      tugadi: false,
      yanaMashq: "Yana mashq qilish · 14 yangi so'z",
    });
  });

  it("says nothing more to meet once every word is seen", () => {
    expect(sozHisoblagichi({ jami: 9, gesehen: 9 })).toMatchObject({
      matn: "So'zlar: 9 / 9",
      foiz: 100,
      qoldi: 0,
      tugadi: true,
      yanaMashq: null,
    });
  });

  it("never counts past the total", () => {
    expect(sozHisoblagichi({ jami: 9, gesehen: 12 })).toMatchObject({
      matn: "So'zlar: 9 / 9",
      tugadi: true,
    });
  });

  it("draws nothing for an older server or a section with no words", () => {
    expect(sozHisoblagichi(undefined)).toBeNull();
    expect(sozHisoblagichi({ jami: 0, gesehen: 0 })).toBeNull();
  });
});
