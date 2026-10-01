import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { DashboardMoney } from "./dashboard-summary-types";
import { HomeMoneyCards } from "./home-money-cards";

const EXPECTED_MONTH_END = 176_200_000;

// Qarz — ikki alohida raqam (ADR-0059). Hech qaysi son boshqasining jami
// summasi emas, hisoblar soni esa pul summasiga teng emas.
const DEBT: DashboardMoney["debt"] = {
  studying: {
    total: 43_500_000,
    count: 237,
    currentMonth: 41_100_000,
    older: 2_400_000,
  },
  notStudying: { total: 40_600_000, count: 327 },
};

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
  debt: DEBT,
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

function renderHtml(m: DashboardMoney): string {
  return renderToStaticMarkup(
    createElement(
      TooltipProvider,
      null,
      createElement(HomeMoneyCards, { money: m }),
    ),
  );
}

function render(m: DashboardMoney): string {
  return norm(renderHtml(m));
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

  it("charged but nothing paid yet reads 0%, not «hisob yozilmagan»", () => {
    const text = render({
      ...money,
      monthCharges: { charged: 900_000, paid: 0, unpaid: 900_000, paidPct: 0 },
    });

    expect(text).toContain(`Bu oy hisoblandi ${fmt(900_000)} to'landi 0%`);
    expect(text).not.toContain("hisob yozilmagan");
  });

  // The drill-down says the same words (income-attribution-panel.test.ts):
  // «to'lov yo'q» read as «charged, nobody paid», which is not this state.
  it("nothing charged says «hisob yozilmagan», with no percentage to print", () => {
    const text = render({
      ...money,
      monthCharges: { charged: 0, paid: 0, unpaid: 0, paidPct: null },
    });

    expect(text).toContain(`Bu oy hisoblandi ${fmt(0)} hisob yozilmagan`);
    expect(text).not.toContain("to'lov yo'q");
    expect(text).not.toContain("null");
  });
});

// «Qarzdorlik» kartasi endi ikki raqamdan birinchisini ko'rsatadi, ikkinchisi
// uning ostida: ikkalasi serverdan keladi va hech qachon qo'shilmaydi.
describe("HomeMoneyCards — the debt card", () => {
  it("leads with «O'qiyotganlar qarzi» and puts the other number under it", () => {
    const text = render(money);

    expect(text).toContain(
      `O'qiyotganlar qarzi ${fmt(43_500_000)} ${fmt(237)} ta · o'qimayotganlar ${fmt(40_600_000)}`,
    );
  });

  it("is not the old «Qarzdorlik» card and prints no sum of the two", () => {
    const text = render(money);

    expect(text).not.toContain("Qarzdorlik");
    expect(text).not.toContain("ta qarzdor");
    expect(text).not.toContain(fmt(43_500_000 + 40_600_000));
    // The 🟡/🔴 split belongs to the debt page and the Moliya block, not here.
    expect(text).not.toContain("eski qarz");
  });

  it("links to the debt page, red while someone studying owes and plain at zero", () => {
    const owing = renderHtml(money);
    expect(owing).toContain('href="/payments/debt"');
    expect(owing).toContain("text-red-600");

    const settled = renderHtml({
      ...money,
      debt: {
        studying: { total: 0, count: 0, currentMonth: 0, older: 0 },
        notStudying: { total: 40_600_000, count: 327 },
      },
    });
    // The other number being large does not redden the card: only the first does.
    expect(settled).not.toContain("text-red-600");
    expect(norm(settled)).toContain(
      `O'qiyotganlar qarzi ${fmt(0)} ${fmt(0)} ta · o'qimayotganlar ${fmt(40_600_000)}`,
    );
  });

  // The client goes live before the server (PR 1 deploys the client first), so
  // for a few minutes it reads the answer of a server older than ADR-0059:
  // `debt: { total, count }`, with no `studying`. A dash then, never a zero (it
  // would read as «nobody owes»), and never that old `total` under the new label
  // — it was every status's debt, not the studying ones'.
  describe("against a server older than the split", () => {
    const oldDebt = { total: 27_748_684, count: 177 } as unknown as
      DashboardMoney["debt"];

    it("draws a dash for the debt, not a zero and not the old total", () => {
      const html = renderHtml({ ...money, debt: oldDebt });
      const text = norm(html);

      // Reaching this line is the first check: the card did not throw.
      expect(text).toContain("O'qiyotganlar qarzi — Sof foyda");
      expect(text).not.toContain(`O'qiyotganlar qarzi ${fmt(0)}`);
      expect(text).not.toContain(fmt(27_748_684));
      expect(text).not.toContain("o'qimayotganlar");
      expect(text).not.toContain("ta qarzdor");
      // Nothing to redden, and the link still goes to the debt page.
      expect(html).not.toContain("text-red-600");
      expect(html).toContain('href="/payments/debt"');
    });

    it("leaves the other three cards as they were", () => {
      const text = render({ ...money, debt: oldDebt });

      expect(text).toContain(`Bu oy tushum ${fmt(128_450_000)} ${fmt(214)} ta to'lov`);
      expect(text).toContain(`Bu oy hisoblandi ${fmt(900_000)} to'landi 66.7%`);
      expect(text).toContain(`Sof foyda ${fmt(18_930_000)} shu oy`);
    });

    it("a response with no debt at all draws the same dash", () => {
      const text = render({ ...money, debt: undefined });

      expect(text).toContain("O'qiyotganlar qarzi — Sof foyda");
      expect(text).not.toContain(`O'qiyotganlar qarzi ${fmt(0)}`);
    });
  });

  // A closed tooltip renders nothing, so the static markup cannot show it — the
  // text is read from the source (payments-overview.test.ts does the same).
  it("explains itself in the tooltip and says the two are not added", () => {
    const source = readFileSync(join(__dirname, "home-money-cards.tsx"), "utf-8")
      .replace(/&apos;/g, "'")
      .replace(/\s+/g, " ");

    expect(source).toContain(
      "Faol guruhda o'qiyotganlarning qarzi. O'qimayotganlar (guruhsiz, muzlatilgan, ketgan) qarzi alohida, qo'shilmaydi.",
    );
  });
});
