import { describe, expect, it } from "vitest";
import { formatPrice } from "@/lib/format-utils";
import {
  buildQuickAmounts,
  monthlyEnrollmentLine,
  monthlySummaryLine,
  suggestedAmountHint,
  type QuickAmountSource,
} from "./record-payment-quick-amounts";

const monthly = (debt: number, nextMonthAmount: number): QuickAmountSource => ({
  model: "MONTHLY",
  currentBalance: -debt,
  primaryEnrollment: null,
  monthly: { debt, nextMonthAmount, discountPercent: 0, enrollments: [] },
});

describe("buildQuickAmounts — monthly", () => {
  it("recommends closing the debt; debt + next month is a prepayment option", () => {
    expect(buildQuickAmounts(monthly(450_000, 405_000))).toEqual([
      { key: "debt", amount: 450_000, label: "Qarzni yopish", recommended: true },
      { key: "debt-next", amount: 855_000, label: "Qarz + keyingi oy", recommended: false },
      { key: "month-1", amount: 405_000, label: "1 oy", recommended: false },
      { key: "month-2", amount: 810_000, label: "2 oy", recommended: false },
    ]);
  });

  it("recommends one month when nothing is owed", () => {
    expect(buildQuickAmounts(monthly(0, 450_000))).toEqual([
      { key: "month-1", amount: 450_000, label: "1 oy", recommended: true },
      { key: "month-2", amount: 900_000, label: "2 oy", recommended: false },
    ]);
  });

  it("offers only the debt when no monthly enrollment is left", () => {
    expect(buildQuickAmounts(monthly(120_000, 0))).toEqual([
      { key: "debt", amount: 120_000, label: "Qarzni yopish", recommended: true },
    ]);
  });

  it("falls back to the fixed grid with neither debt nor a next month", () => {
    expect(buildQuickAmounts(monthly(0, 0))).toBeNull();
  });

  it("never mentions cycles or lessons", () => {
    for (const q of buildQuickAmounts(monthly(450_000, 405_000)) ?? []) {
      expect(q.label).not.toMatch(/sikl|dars/i);
    }
  });
});

describe("buildQuickAmounts — lesson pack", () => {
  const primaryEnrollment = { fullCycleCost: 414_000, lessonPaymentCount: 12 };

  it("keeps the cycle buttons unchanged", () => {
    expect(
      buildQuickAmounts({ model: "LESSON_PACK", currentBalance: -100_000, primaryEnrollment, monthly: null }),
    ).toEqual([
      { key: "recommended", amount: 514_000, label: "Qarz + 1 sikl (12 dars)", recommended: true },
      { key: "cycle-1", amount: 414_000, label: "+1 sikl (12 dars)", recommended: false },
      { key: "cycle-2", amount: 828_000, label: "+2 sikl (24 dars)", recommended: false },
    ]);
  });

  it("reads a response without model (older server) as a lesson pack", () => {
    const res = buildQuickAmounts({ currentBalance: 0, primaryEnrollment });
    expect(res?.[0]).toEqual({
      key: "recommended",
      amount: 414_000,
      label: "1 to'liq sikl (12 dars)",
      recommended: true,
    });
  });

  it("returns null without a primary enrollment", () => {
    expect(buildQuickAmounts({ model: "LESSON_PACK", currentBalance: 0, primaryEnrollment: null })).toBeNull();
  });
});

describe("texts", () => {
  it("drops the cycle wording from the hint unless the student is on a lesson pack", () => {
    expect(suggestedAmountHint(450_000, "MONTHLY")).toBe(`Tavsiya: ${formatPrice(450_000)} so'm`);
    expect(suggestedAmountHint(450_000, undefined)).toBe(
      `Tavsiya: ${formatPrice(450_000)} so'm — kurs to'liq tsikl narxi`,
    );
    expect(suggestedAmountHint(414_000, "LESSON_PACK")).toBe(
      `Tavsiya: ${formatPrice(414_000)} so'm — kurs to'liq tsikl narxi`,
    );
  });

  it("shows a monthly enrollment with its discounted price", () => {
    const e = { groupName: "#029", courseName: "Intensive", monthlyPrice: 450_000, amount: 450_000 };
    expect(monthlyEnrollmentLine(e)).toBe(`#029 · Intensive · oyiga ${formatPrice(450_000)} so'm`);
    expect(monthlyEnrollmentLine({ ...e, amount: 405_000 })).toBe(
      `#029 · Intensive · oyiga ${formatPrice(405_000)} so'm (chegirmasiz ${formatPrice(450_000)})`,
    );
  });

  it("summarises debt and next month, or nothing", () => {
    expect(monthlySummaryLine({ debt: 120_000, nextMonthAmount: 450_000, discountPercent: 0, enrollments: [] })).toBe(
      `Qarz: ${formatPrice(120_000)} so'm · Keyingi oy: ${formatPrice(450_000)} so'm`,
    );
    expect(monthlySummaryLine({ debt: 0, nextMonthAmount: 0, discountPercent: 0, enrollments: [] })).toBeNull();
  });
});
