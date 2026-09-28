import { describe, expect, it } from "vitest";
import {
  canEditPayment,
  isCancelReasonValid,
  normalizePaymentNote,
  paymentEditChanged,
  paymentMethodSummary,
} from "./mock-payment";

describe("to'lov usulining jadvaldagi yozuvi", () => {
  it("to'lanmagan ishtirokchida hech narsa yozilmaydi", () => {
    expect(
      paymentMethodSummary({
        paid: false,
        paymentMethod: null,
        paymentSource: null,
      }),
    ).toBeNull();
  });

  it("admin qabul qilgan to'lovda tanlangan usul", () => {
    expect(
      paymentMethodSummary({
        paid: true,
        paymentMethod: "CASH",
        paymentSource: "MANUAL",
      }),
    ).toBe("Naqd");
  });

  it("onlayn to'lov onlayn deb belgilanadi", () => {
    expect(
      paymentMethodSummary({
        paid: true,
        paymentMethod: "CLICK",
        paymentSource: "GATEWAY",
      }),
    ).toBe("Click · onlayn");
  });

  it("eski balans to'lovi «Balansdan»", () => {
    expect(
      paymentMethodSummary({
        paid: true,
        paymentMethod: null,
        paymentSource: "BALANCE",
        paidFromBalance: true,
      }),
    ).toBe("Balansdan");
  });

  // Usul avval hech qayerga yozilmasdi: eski qatorlarda u noma'lum va
  // taxmin qilinmaydi (masalan, «Naqd» deb).
  it("usuli saqlanmagan eski to'lovda hech narsa taxmin qilinmaydi", () => {
    expect(
      paymentMethodSummary({
        paid: true,
        paymentMethod: null,
        paymentSource: "MANUAL",
      }),
    ).toBeNull();
  });
});

describe("qaysi to'lovni tahrirlash mumkin", () => {
  it("faqat admin qabul qilgan to'lovni", () => {
    expect(
      canEditPayment({ paid: true, paymentMethod: "CASH", paymentSource: "MANUAL" }),
    ).toBe(true);
  });

  // Payme/Click puli to'lov tizimida — bu yerda belgini olib tashlash pulni
  // qaytarmaydi. Balans to'lovi esa o'chirishda balansga o'zi qaytadi.
  it("onlayn va balans to'lovlarini emas", () => {
    expect(
      canEditPayment({ paid: true, paymentMethod: "PAYME", paymentSource: "GATEWAY" }),
    ).toBe(false);
    expect(
      canEditPayment({ paid: true, paymentMethod: null, paymentSource: "BALANCE" }),
    ).toBe(false);
  });

  it("to'lanmagan ishtirokchida tahrirlanadigan to'lov yo'q", () => {
    expect(
      canEditPayment({ paid: false, paymentMethod: null, paymentSource: null }),
    ).toBe(false);
  });
});

describe("tahrirlash oynasi", () => {
  const original = { paymentMethod: "CASH" as const, paymentNote: "kassa" };

  it("hech narsa o'zgarmasa «Saqlash» yopiq", () => {
    expect(paymentEditChanged(original, "CASH", "kassa")).toBe(false);
    expect(paymentEditChanged(original, "CASH", "  kassa  ")).toBe(false);
  });

  it("usul yoki izoh o'zgarsa ochiladi", () => {
    expect(paymentEditChanged(original, "CLICK", "kassa")).toBe(true);
    expect(paymentEditChanged(original, "CASH", "chek 12")).toBe(true);
    expect(paymentEditChanged(original, "CASH", "   ")).toBe(true);
  });

  it("usuli saqlanmagan to'lovda usul tanlanmaguncha yopiq", () => {
    const legacy = { paymentMethod: null, paymentNote: null };
    expect(paymentEditChanged(legacy, null, "izoh")).toBe(false);
    expect(paymentEditChanged(legacy, "CASH", "")).toBe(true);
  });

  it("bo'sh izoh — izoh yo'q", () => {
    expect(normalizePaymentNote("   ")).toBeNull();
    expect(normalizePaymentNote(" chek 5 ")).toBe("chek 5");
  });
});

describe("bekor qilish sababi", () => {
  it("bo'shliqlarsiz kamida 3 belgi", () => {
    expect(isCancelReasonValid("")).toBe(false);
    expect(isCancelReasonValid("  ab  ")).toBe(false);
    expect(isCancelReasonValid("xato")).toBe(true);
  });
});
