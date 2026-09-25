import { describe, expect, it } from "vitest";
import { canConfirmDelete, deleteRequestParams } from "./participant-delete";

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
});
