import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { DashboardMoney } from "./dashboard-summary-types";
import { HomeMoneyCards } from "./home-money-cards";

const EXPECTED_MONTH_END = 176_200_000;

const money: DashboardMoney = {
  monthIncome: 128_450_000,
  paymentCount: 214,
  expectedMonthEnd: EXPECTED_MONTH_END,
  monthCharges: {
    charged: 900_000,
    paid: 600_000,
    unpaid: 300_000,
    paidPct: 66.7,
  },
  netProfit: 18_930_000,
  netProfitBasis: "recognized",
  debt: { total: 27_748_684, count: 177 },
};

// Same locale the cards format with, so the assertions hold whatever ICU the
// machine running the tests carries; `norm` turns its U+00A0 into a plain space
// like the page text it is compared with.
const fmt = (n: number) => norm(n.toLocaleString("uz-UZ"));

function norm(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

function render(m: DashboardMoney): string {
  return norm(
    renderToStaticMarkup(
      createElement(
        TooltipProvider,
        null,
        createElement(HomeMoneyCards, { money: m }),
      ),
    ),
  );
}

// A monthly-payment month (ADR-0058) leads with what was charged; an older
// month keeps «Oy oxiriga kutilyapti».
describe("HomeMoneyCards — the month card", () => {
  it("a monthly-payment month shows hisoblandi and the paid share from the server", () => {
    const text = render(money);

    expect(text).toContain(`Bu oy hisoblandi ${fmt(900_000)} to'landi 66.7%`);
    // The forecast is not drawn beside it, and its figure is nowhere on the page.
    expect(text).not.toContain("Oy oxiriga kutilyapti");
    expect(text).not.toContain(fmt(EXPECTED_MONTH_END));
  });

  it("an older month keeps «Oy oxiriga kutilyapti» and has no month bill", () => {
    const text = render({ ...money, monthCharges: null });

    expect(text).toContain(
      `Oy oxiriga kutilyapti ${fmt(EXPECTED_MONTH_END)} prognoz`,
    );
    expect(text).not.toContain("Bu oy hisoblandi");
  });

  it("charged but nothing paid yet reads 0%, not «to'lov yo'q»", () => {
    const text = render({
      ...money,
      monthCharges: { charged: 900_000, paid: 0, unpaid: 900_000, paidPct: 0 },
    });

    expect(text).toContain(`Bu oy hisoblandi ${fmt(900_000)} to'landi 0%`);
  });

  it("nothing charged has no percentage to print", () => {
    const text = render({
      ...money,
      monthCharges: { charged: 0, paid: 0, unpaid: 0, paidPct: null },
    });

    expect(text).toContain(`Bu oy hisoblandi ${fmt(0)} to'lov yo'q`);
    expect(text).not.toContain("null");
  });
});
