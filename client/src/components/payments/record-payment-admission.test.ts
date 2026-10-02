import { describe, expect, it } from "vitest";
import { formatPrice } from "@/lib/format-utils";
import {
  promiseDefaultDate,
  promiseNeeded,
  reachLines,
} from "./record-payment-admission";

const part = {
  paidThrough: "2026-10-05",
  next: { date: "2026-10-07", groupName: "#005", needed: 3846 },
  clearsDebt: false,
};

describe("record-payment-admission", () => {
  it("says how far the money reaches and what the next lesson needs", () => {
    expect(reachLines(part)).toEqual([
      "Bu pul 05.10 gacha yetadi: bugungi darsga kiradi.",
      `Keyingi dars 07.10 (#005): yana kamida ${formatPrice(3846)} so'm kerak.`,
    ]);
  });

  it("says when even today is not covered", () => {
    expect(
      reachLines({
        ...part,
        paidThrough: null,
        next: { ...part.next, date: "2026-10-05", needed: 69231 },
      }),
    ).toEqual([
      `Bu pul bugungi darsga yetmaydi: kamida yana ${formatPrice(69231)} so'm kerak (05.10, #005).`,
    ]);
  });

  describe("the least share of the month (ADR-0064)", () => {
    const short = {
      paidThrough: null,
      next: { date: "2026-11-04", groupName: "#005", needed: 125000, minPaidPercent: 50 },
      clearsDebt: false,
    };

    it("says the share is what is short, not the lesson", () => {
      expect(reachLines(short)).toEqual([
        `Bu pul darsga kirish uchun yetmaydi: oy to'lovining kamida 50% i to'lanishi kerak — yana ${formatPrice(125000)} so'm (04.11, #005).`,
      ]);
    });

    it("says it about the next lesson when today's is still open", () => {
      expect(reachLines({ ...short, paidThrough: "2026-11-02" })).toEqual([
        "Bu pul 02.11 gacha yetadi: bugungi darsga kiradi.",
        `Keyingi dars 04.11 (#005): oy to'lovining kamida 50% i to'lanishi kerak — yana ${formatPrice(125000)} so'm.`,
      ]);
    });

    it("keeps the old wording when the lessons held are short (an older server sends no percent)", () => {
      expect(reachLines({ ...part, next: { ...part.next, minPaidPercent: null } })).toEqual(
        reachLines(part),
      );
    });
  });

  it("a clearing payment needs no promise", () => {
    const full = { paidThrough: "2026-10-30", next: null, clearsDebt: true };
    expect(reachLines(full)).toEqual([
      "Qarz to'liq yopiladi: oyning oxirigacha qatnashadi.",
    ]);
    expect(promiseNeeded(full)).toBe(false);
    expect(promiseNeeded(null)).toBe(false);
  });

  it("a part payment needs a promise, defaulting to the first unpaid lesson", () => {
    expect(promiseNeeded(part)).toBe(true);
    const day = promiseDefaultDate(part);
    expect(day?.getFullYear()).toBe(2026);
    expect(day?.getMonth()).toBe(9);
    expect(day?.getDate()).toBe(7);
    expect(promiseDefaultDate({ ...part, next: null })).toBeNull();
  });
});
