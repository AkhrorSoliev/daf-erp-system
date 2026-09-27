import { describe, expect, it } from "vitest";
import { formatPrice } from "@/lib/format-utils";
import { admissionCopy } from "./attendance-admission";

const blocked = {
  admitted: false,
  reason: "NOT_PAID" as const,
  shortfall: 69231,
  paidThrough: null,
};

describe("admissionCopy", () => {
  it("warns the teacher in the CEO's words", () => {
    expect(admissionCopy(blocked, false)).toEqual({
      blocked: true,
      label: "To'lov qilinmagan · darsga qo'yilmaydi",
      warning:
        "Bu o'quvchi oylik to'lovni qilmagan. Shartnomaga ko'ra 2-darsdan boshlab to'lov qilinmaguncha darsga qo'yilmaydi. Agar u darsda o'tirsa va keyinroq to'lov qilsa ham, bu dars uchun sizga ish haqi yozilmaydi.",
    });
  });

  it("tells the admin the least payment for today", () => {
    expect(admissionCopy(blocked, true).warning).toBe(
      `Bugungi darsga kirishi uchun kamida ${formatPrice(69231)} so'm kerak. Oyni to'liq qoplamasa, qolgan qismi uchun to'lov va'dasi yoziladi.`,
    );
  });

  it("names how far a part payment reaches", () => {
    expect(
      admissionCopy(
        { admitted: true, reason: "PAID", shortfall: 0, paidThrough: "2026-10-09" },
        false,
      ),
    ).toEqual({
      blocked: false,
      label: "Qisman to'lagan · 09.10 gacha qatnasha oladi",
      warning: null,
    });
  });

  it("says nothing for a paid or ungated student", () => {
    expect(
      admissionCopy(
        { admitted: true, reason: "PAID", shortfall: 0, paidThrough: null },
        true,
      ),
    ).toEqual({ blocked: false, label: null, warning: null });
    expect(admissionCopy(undefined, true)).toEqual({
      blocked: false,
      label: null,
      warning: null,
    });
  });
});
