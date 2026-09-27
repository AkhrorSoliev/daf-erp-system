import { describe, expect, it } from "vitest";
import { formatPrice } from "@/lib/format-utils";
import {
  expenseLabel,
  expenseSummary,
  headline,
  mln,
  reconciliation,
  statusLabel,
  type ProfitComposition,
} from "./profit-composition-text";

describe("mln", () => {
  it("reads millions with one decimal and a comma", () => {
    expect(mln(47_598_862)).toBe("47,6 mln");
    expect(mln(-3_774_252)).toBe("-3,8 mln");
  });

  it("keeps small sums whole", () => {
    expect(mln(800_000)).toBe(`${formatPrice(800_000)} so'm`);
  });
});

describe("statusLabel", () => {
  const status = { daysInMonth: 30, todayStr: "2026-09-26" };

  it("counts the days of a running month", () => {
    expect(
      statusLabel({
        month: "2026-09",
        status: { ...status, isOpen: true, daysPassed: 26 },
      }),
    ).toBe("Sentabr 2026 · 26 kun o'tdi, 4 kun qoldi");
  });

  it("says a past month is closed", () => {
    expect(
      statusLabel({
        month: "2026-08",
        status: { ...status, isOpen: false, daysPassed: 31 },
      }),
    ).toBe("Avgust 2026 · oy yakunlangan");
  });
});

describe("headline", () => {
  it("says what the lessons brought and what was left", () => {
    expect(headline(141_784_680, 47_598_862)).toBe(
      "Darslardan 141,8 mln tushdi — ustozlar, xodimlar va xarajatlardan keyin 47,6 mln qoldi.",
    );
  });

  it("calls a loss a loss", () => {
    expect(headline(10_000_000, -2_000_000)).toContain("2,0 mln zarar");
  });
});

describe("expenses", () => {
  it("uses the expenses page's words", () => {
    expect(expenseLabel("SUPPLIES")).toBe("Ta'minot");
    expect(expenseLabel("TAXES")).toBe("Soliq");
  });

  it("summarises the three largest categories", () => {
    expect(
      expenseSummary([
        { category: "MARKETING", amount: 5_800_000, items: [] },
        { category: "OTHER", amount: 4_329_000, items: [] },
        { category: "SUPPLIES", amount: 2_120_000, items: [] },
        { category: "UTILITIES", amount: 70_000, items: [] },
      ]),
    ).toBe("Marketing 5,8 mln · Boshqa 4,3 mln · Ta'minot 2,1 mln");
  });
});

describe("reconciliation", () => {
  it("writes the sum the card's figure comes from", () => {
    const c = {
      revenue: { total: 141_784_680 },
      teachers: { total: 66_966_818 },
      staff: { total: 14_900_000 },
      expenses: { total: 12_319_000 },
      refunds: 0,
      netProfit: 47_598_862,
    } as unknown as ProfitComposition;
    // Same formatter as every other figure on the page.
    const f = formatPrice;
    expect(reconciliation(c)).toBe(
      `${f(141_784_680)} − ${f(66_966_818)} − ${f(14_900_000)} − ${f(12_319_000)} − ${f(0)} = ${f(47_598_862)}`,
    );
  });
});
