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

  describe("below the least share of the month (ADR-0064)", () => {
    const belowShare = {
      admitted: false,
      reason: "BELOW_MIN_SHARE" as const,
      shortfall: 125000,
      paidThrough: null,
      minPaidPercent: 50,
    };

    it("names the share on the row and to the teacher", () => {
      expect(admissionCopy(belowShare, false)).toEqual({
        blocked: true,
        label: "Oy to'lovining 50% i to'lanmagan · darsga qo'yilmaydi",
        warning:
          "Bu o'quvchi oy to'lovining kamida 50% ini to'lamagan. Shartnomaga ko'ra 2-darsdan boshlab shu qismi to'lanmaguncha darsga qo'yilmaydi. Agar u darsda o'tirsa va keyinroq to'lov qilsa ham, bu dars uchun sizga ish haqi yozilmaydi.",
      });
    });

    it("tells the admin what brings the student up to the share", () => {
      expect(admissionCopy(belowShare, true).warning).toBe(
        `Bu darsga kirishi uchun kamida ${formatPrice(125000)} so'm kerak: oy to'lovining 50% i to'lanishi shart. Oyni to'liq qoplamasa, qolgan qismi uchun to'lov va'dasi yoziladi.`,
      );
    });

    it("is blocked like any unpaid student", () => {
      expect(markableStudents([{ admission: belowShare }])).toEqual([]);
      expect(suggestedPaymentAmount(belowShare)).toBe(125000);
    });
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

describe("admissionCopy with the server's reach", () => {
  // October at #069: 13 lessons, 417 857 charged.
  const reach = (over: object = {}) => ({
    lessons: 13,
    paidLessons: 10,
    lastPaid: "2026-10-24",
    monthCharged: 417857,
    monthPaid: 337500,
    next: { date: "2026-10-27", needed: 15715 },
    ...over,
  });
  const label = (admission: object, isAdmin = true) =>
    admissionCopy(admission as never, isAdmin).label;

  it("a first lesson names how far the money reaches", () => {
    expect(
      label({
        admitted: true,
        reason: "FIRST_LESSON",
        shortfall: 0,
        paidThrough: "2026-10-24",
        reach: reach(),
      }),
    ).toBe("Qisman to'lagan · 13 darsdan 10 tasi · 24.10 gacha");
  });

  it("a later lesson counts the lessons too", () => {
    expect(
      label({
        admitted: true,
        reason: "PAID",
        shortfall: 0,
        paidThrough: "2026-10-24",
        reach: reach(),
      }),
    ).toBe("Qisman to'lagan · 13 darsdan 10 tasi · 24.10 gacha");
  });

  describe("a first lesson the money does not pass", () => {
    const unpaidFirst = {
      admitted: true,
      reason: "FIRST_LESSON" as const,
      shortfall: 0,
      paidThrough: null,
      reach: reach({
        paidLessons: 0,
        lastPaid: null,
        monthPaid: 0,
        next: { date: "2026-10-05", needed: 213000 },
      }),
    };

    it("tells the admin what the next lesson needs", () => {
      expect(label(unpaidFirst)).toBe(
        `1-dars to'lovsiz · keyingi dars (05.10) uchun kamida ${formatPrice(213000)} so'm kerak`,
      );
    });

    it("gives the teacher no amount", () => {
      expect(label(unpaidFirst, false)).toBe(
        "1-dars to'lovsiz · keyingi darsdan to'lov kerak",
      );
    });
  });

  it("says nothing once the month is paid, a later month owed or not", () => {
    expect(
      label({
        admitted: true,
        reason: "PAID",
        shortfall: 0,
        paidThrough: "2026-10-31",
        reach: reach({ paidLessons: 13, next: null }),
      }),
    ).toBeNull();
  });

  describe("a blocked student is labelled by what he paid", () => {
    const blockedWith = (reason: string, over: object) => ({
      admitted: false,
      reason,
      shortfall: 125000,
      paidThrough: null,
      minPaidPercent: reason === "BELOW_MIN_SHARE" ? 50 : undefined,
      reach: reach(over),
    });

    it("nothing paid reads «not paid», whichever rule keeps him out", () => {
      for (const reason of ["NOT_PAID", "BELOW_MIN_SHARE"]) {
        expect(label(blockedWith(reason, { monthPaid: 0 }))).toBe(
          "To'lov qilinmagan · darsga qo'yilmaydi",
        );
      }
    });

    it("short of the least share names the share paid, rounded down", () => {
      expect(
        label(
          blockedWith("BELOW_MIN_SHARE", {
            monthCharged: 450000,
            monthPaid: 223000, // 49.6%
          }),
        ),
      ).toBe("Oyning 49% i to'langan · kamida 50% kerak · darsga qo'yilmaydi");
    });

    it("a part payer the lessons outran names how far the money went", () => {
      expect(
        label(
          blockedWith("NOT_PAID", {
            monthPaid: 180000,
            lastPaid: "2026-10-12",
          }),
        ),
      ).toBe("Qisman to'lagan · puli 12.10 gacha yetdi · darsga qo'yilmaydi");
      expect(
        label(blockedWith("NOT_PAID", { monthPaid: 16670, lastPaid: null })),
      ).toBe("Qisman to'lagan · darsga qo'yilmaydi");
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
