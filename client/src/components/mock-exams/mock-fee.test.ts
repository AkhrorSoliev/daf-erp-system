import { describe, expect, it } from "vitest";
import { mockPaymentState, participantFee } from "./mock-fee";

// Ishtirokchi to'lashi kerak bo'lgan summa — ro'yxatdan o'tishda qotirilgan
// `feeAmount` (DaF chegirmasi bilan). Imtihonning to'liq narxi faqat eski
// (feeAmount'siz) qatorlar uchun. Ilgari "To'lov qabul qilish" oynasi va
// o'quvchi profili to'liq narxga qarardi: DaF narxi 40 000 bo'lgan o'quvchidan
// 60 000 so'ralar, DaF uchun bepul mock esa "Kutilmoqda" ko'rinardi.
describe("mock to'lov summasi va holati", () => {
  it("qotirilgan chegirmali summani oladi", () => {
    expect(participantFee({ feeAmount: 40000 }, 60000)).toBe(40000);
  });

  it("eski qatorda imtihon narxiga qaytadi", () => {
    expect(participantFee({ feeAmount: null }, 60000)).toBe(60000);
    expect(participantFee({}, 60000)).toBe(60000);
  });

  it("DaF uchun bepul (feeAmount 0) — to'liq narxga qaytmaydi", () => {
    expect(participantFee({ feeAmount: 0 }, 60000)).toBe(0);
  });

  it("holat: to'langan / kutilmoqda / bepul", () => {
    expect(mockPaymentState({ paid: true, feeAmount: 40000 }, 60000)).toBe(
      "paid",
    );
    expect(mockPaymentState({ paid: false, feeAmount: 40000 }, 60000)).toBe(
      "pending",
    );
    expect(mockPaymentState({ paid: false, feeAmount: 0 }, 60000)).toBe("free");
  });
});
