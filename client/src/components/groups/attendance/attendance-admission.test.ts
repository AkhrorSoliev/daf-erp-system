import { describe, expect, it } from "vitest";
import { formatPrice } from "@/lib/format-utils";
import {
  admissionCopy,
  markableStudents,
  suggestedPaymentAmount,
} from "./attendance-admission";

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

  it("tells the admin the least payment for THIS lesson (it also serves a past one in «Bo'ldi»)", () => {
    const warning = admissionCopy(blocked, true).warning;
    expect(warning).toBe(
      `Bu darsga kirishi uchun kamida ${formatPrice(69231)} so'm kerak. Oyni to'liq qoplamasa, qolgan qismi uchun to'lov va'dasi yoziladi.`,
    );
    expect(warning).not.toContain("Bugungi");
  });

  it("locks a student the register left out, with no payment prompt", () => {
    const leftOut = {
      admitted: false,
      reason: "LEFT_OUT" as const,
      shortfall: 0,
      paidThrough: null,
    };
    expect(admissionCopy(leftOut, true)).toEqual({
      blocked: true,
      label: "Dars vaqtida davomatga kiritilmagan",
      warning: null,
    });
    expect(markableStudents([{ admission: leftOut }])).toEqual([]);
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

describe("markableStudents", () => {
  const paid = {
    admitted: true,
    reason: "PAID" as const,
    shortfall: 0,
    paidThrough: null,
  };
  const roster = [
    { id: 1, admission: paid },
    { id: 2, admission: blocked },
    { id: 3 }, // an older server sends no admission: admitted
    { id: 4, admission: { ...paid, reason: "FIRST_LESSON" as const } },
    { id: 5, admission: { ...blocked, shortfall: 1000 } },
  ];

  it("leaves out only the students contract 3.2 blocks", () => {
    expect(markableStudents(roster).map((s) => s.id)).toEqual([1, 3, 4]);
  });

  it("an all-blocked roster has nobody to mark (and so nobody unmarked)", () => {
    expect(markableStudents([roster[1], roster[4]])).toEqual([]);
  });

  it("keeps a roster untouched when nobody is blocked", () => {
    const open = [roster[0], roster[2], roster[3]];
    expect(markableStudents(open)).toEqual(open);
  });
});

describe("suggestedPaymentAmount", () => {
  const owes = (shortfall: number) => ({
    admitted: false,
    reason: "NOT_PAID" as const,
    shortfall,
    paidThrough: null,
  });

  it("rounds the shortfall up to a whole 1 000 so'm", () => {
    expect(suggestedPaymentAmount(owes(69231))).toBe(70000);
    expect(suggestedPaymentAmount(owes(70000))).toBe(70000);
    expect(suggestedPaymentAmount(owes(70001))).toBe(71000);
  });

  it("never suggests less than 1 000", () => {
    expect(suggestedPaymentAmount(owes(1))).toBe(1000);
    expect(suggestedPaymentAmount(owes(0))).toBe(1000);
  });

  it("suggests nothing without an admission", () => {
    expect(suggestedPaymentAmount(undefined)).toBeUndefined();
  });
});
