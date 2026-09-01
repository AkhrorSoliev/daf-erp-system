import { describe, expect, it } from "vitest";
import { leadHolatiParams } from "./lead-filter-schema";

describe("leadHolatiParams", () => {
  it("hech narsa tanlanmasa parametr yo'q", () => {
    expect(leadHolatiParams([])).toEqual({});
  });

  it("bitta bosqichni o'z parametriga o'giradi", () => {
    expect(leadHolatiParams(["NEW"])).toEqual({ status: "NEW" });
  });

  it("bir guruhdagi bir nechta bosqich vergul bilan qo'shiladi (YOKI)", () => {
    expect(leadHolatiParams(["NEW", "CONVERTED"])).toEqual({
      status: "NEW,CONVERTED",
    });
  });

  it("turli guruhlar alohida parametr bo'ladi (VA)", () => {
    expect(leadHolatiParams(["NEW", "uncalled"])).toEqual({
      status: "NEW",
      called: "false",
    });
  });

  it("ikki qiymatli o'lcham to'liq tanlansa parametr tushirib qoldiriladi", () => {
    // «Aloqaga chiqilgan» + «chiqilmagan» = hamma lid; ikkovini AND qilish
    // doim bo'sh ro'yxat berardi.
    expect(leadHolatiParams(["called", "uncalled"])).toEqual({});
    expect(leadHolatiParams(["commented", "uncommented"])).toEqual({});
  });

  it("bosqich TO'LIQ o'lcham emas — ikkovi tanlansa ham filtr qoladi", () => {
    // LeadStatus da olti qiymat bor, dropdown esa ikkitasini taklif qiladi.
    // Filtrni tushirish LOST/ARCHIVED lidlarni jimgina qaytargan bo'lardi.
    expect(leadHolatiParams(["NEW", "CONVERTED"])).toEqual({
      status: "NEW,CONVERTED",
    });
  });

  it("to'liq o'lchamni tushiradi, qolganini saqlaydi", () => {
    expect(leadHolatiParams(["called", "uncalled", "NEW"])).toEqual({
      status: "NEW",
    });
  });

  it("uch guruh birga ishlaydi", () => {
    expect(leadHolatiParams(["CONVERTED", "called", "uncommented"])).toEqual({
      status: "CONVERTED",
      called: "true",
      hasComments: "false",
    });
  });

  it("notanish tokenni e'tiborsiz qoldiradi", () => {
    expect(leadHolatiParams(["yolgon", "NEW"])).toEqual({ status: "NEW" });
  });
});
