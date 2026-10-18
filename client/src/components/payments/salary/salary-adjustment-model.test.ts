import { describe, expect, it } from "vitest";
import { formatPrice } from "@/lib/format-utils";
import {
  adjustLockReason,
  adjustmentError,
  adjustmentFacts,
  adjustmentMeta,
  diffText,
} from "./salary-adjustment-model";

describe("adjustmentFacts", () => {
  it("is manual only when an adjustment stands, and keeps the formula", () => {
    expect(
      adjustmentFacts({
        monthly: 2_076_000,
        calculated: 2_000_000,
        adjustment: { amount: 2_076_000, reason: "x", by: null, at: "2026-10-17T10:00:00.000Z" },
      }),
    ).toEqual({ manual: true, formula: 2_000_000, current: 2_076_000 });
    expect(adjustmentFacts({ monthly: 3_000_000, adjustment: null })).toEqual({
      manual: false,
      formula: 3_000_000,
      current: 3_000_000,
    });
  });
});

describe("diffText", () => {
  it("names the difference from the formula with a sign", () => {
    // `formatPrice` separates thousands with U+00A0, so build the expectation with it.
    expect(diffText(2_076_000, 2_000_000)).toBe(`Hisobdan farq: +${formatPrice(76_000)} so'm`);
    expect(diffText(1_900_000, 2_000_000)).toBe(`Hisobdan farq: −${formatPrice(100_000)} so'm`);
    expect(diffText(2_000_000, 2_000_000)).toBe("Hisobdan farq yo'q");
  });
});

describe("adjustmentError", () => {
  it("needs an amount and a reason of 3 to 300 characters", () => {
    expect(adjustmentError(null, "sabab")).toBe("Summani kiriting");
    expect(adjustmentError(-1, "sabab")).toBe("Summani kiriting");
    expect(adjustmentError(0, "  ab ")).toBe("Sababini yozing");
    expect(adjustmentError(0, "x".repeat(301))).toBe("Sabab 300 belgidan oshmasin");
    expect(adjustmentError(2_076_000, " oy o'rtasidan ")).toBeNull();
  });
});

describe("adjustLockReason", () => {
  it("shuts the button once the payment is approved or paid", () => {
    expect(adjustLockReason(null)).toBeNull();
    expect(adjustLockReason({ status: "CALCULATED" })).toBeNull();
    expect(adjustLockReason({ status: "CANCELLED" })).toBeNull();
    expect(adjustLockReason({ status: "APPROVED" })).toContain("tasdiqlangan");
    expect(adjustLockReason({ status: "PAID" })).toContain("tasdiqlangan");
  });
});

describe("adjustmentMeta", () => {
  it("says who and when", () => {
    const text = adjustmentMeta({
      amount: 1,
      reason: "x",
      by: { id: 1, firstName: "Ahror", lastName: "S." },
      at: "2026-10-17T10:00:00.000Z",
    });
    expect(text).toContain("Ahror S.");
    expect(text).toContain("17.10.2026");
  });
});
