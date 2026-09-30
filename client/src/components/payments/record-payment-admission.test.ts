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
