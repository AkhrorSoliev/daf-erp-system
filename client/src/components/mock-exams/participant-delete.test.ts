import { describe, expect, it } from "vitest";
import {
  canConfirmDelete,
  deleteRequestParams,
  pageAfterRemoval,
} from "./participant-delete";

// To'lagan ishtirokchining ro'yxati jim o'chirilardi: pul mock daromadidan
// tushib qolar, odam qayta yozilsa undan YANA to'lov so'ralardi. Endi admin
// pulni qaytarganini ochiq tasdiqlamaguncha o'chirib bo'lmaydi.
describe("to'lagan ishtirokchini o'chirish", () => {
  it("to'lamagan ishtirokchini darhol o'chirishga ruxsat beradi", () => {
    expect(canConfirmDelete({ paid: false }, false)).toBe(true);
    expect(deleteRequestParams({ paid: false }, false)).toBeUndefined();
  });

  it("to'lagan ishtirokchida tasdiqsiz tugma yopiq", () => {
    expect(canConfirmDelete({ paid: true }, false)).toBe(false);
  });

  it("tasdiqlansa serverga refundConfirmed yuboradi", () => {
    expect(canConfirmDelete({ paid: true }, true)).toBe(true);
    expect(deleteRequestParams({ paid: true }, true)).toEqual({
      refundConfirmed: true,
    });
  });

  // 2026-08 gacha balansdan yechilgan to'lov: server o'chirishda pulni
  // balansga O'ZI qaytaradi. Oyna "pulni qaytaring" desa, admin naqd ham
  // berib, pul ikki marta qaytib ketardi.
  it("balansdan to'langan eski ishtirokchida tasdiq so'ramaydi", () => {
    const p = { paid: true, paidFromBalance: true };
    expect(canConfirmDelete(p, false)).toBe(true);
    expect(deleteRequestParams(p, false)).toBeUndefined();
  });
});

// 11 ishtirokchi: 2-sahifadagi yagona qator o'chirilgach sahifa bo'sh qolar,
// jami 10 ga tushib sahifalash yashirinar va orqaga qaytib bo'lmasdi.
describe("o'chirishdan keyingi sahifa", () => {
  it("sahifadagi oxirgi qator o'chsa oldingi sahifaga o'tadi", () => {
    expect(pageAfterRemoval(2, 1)).toBe(1);
  });

  it("sahifada boshqa qatorlar qolsa o'sha sahifada qoladi", () => {
    expect(pageAfterRemoval(2, 3)).toBe(2);
  });

  it("birinchi sahifadan chiqib ketmaydi", () => {
    expect(pageAfterRemoval(1, 1)).toBe(1);
  });
});
