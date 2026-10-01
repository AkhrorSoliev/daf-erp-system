import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/payments/overview",
  useRouter: () => ({ push() {}, replace() {}, back() {}, prefetch() {} }),
  useSearchParams: () => new URLSearchParams(),
}));

// A zustand store renders its INITIAL state on the server, whatever `setState`
// has since set, so the signed-in CEO has to come from the module itself.
vi.mock("@/hooks/use-auth", () => {
  const state = { user: { roles: [{ id: 1, name: "CEO" }] } };
  const useAuth = Object.assign(
    (select: (s: typeof state) => unknown) => select(state),
    { getState: () => state, setState: () => {}, subscribe: () => () => {} },
  );
  return { useAuth };
});

import { TooltipProvider } from "@/components/ui/tooltip";
import { PaymentsOverview, type MonthCharges } from "./payments-overview";

const START = "2026-10-01";
const END = "2026-10-31";

const charges: MonthCharges = {
  month: "2026-10",
  charged: 900_000,
  paid: 350_000,
  unpaid: 550_000,
  paidPct: 38.9,
  students: 2,
};

const EXPECTED_MONTH_END = 12_345_678;

/**
 * The overview as the CEO's request returns it, with only what the card reads.
 * `salaryMonth` is the month of the computed salary («Ustoz oyliklari»); left
 * out, the response carries no computed salary at all.
 */
const overview = (monthCharges: MonthCharges | null, salaryMonth?: string) => ({
  income: { expected: 0, actual: 5_000_000, paymentCount: 3, byMethod: [] },
  forecast: {
    expectedMonthEnd: EXPECTED_MONTH_END,
    expectedHeld: 1_000_000,
    expectedRemaining: 2_000_000,
    outstandingReceivable: 0,
    debtorExposure: { count: 0, avgDebt: 0 },
  },
  monthCharges,
  ...(salaryMonth
    ? {
        salary: {
          paid: 0,
          pending: 0,
          computed: {
            month: salaryMonth,
            hasLessonData: true,
            netToPay: 2_000_000,
            advances: 500_000,
            gross: 2_500_000,
          },
        },
      }
    : {}),
});

// Same formatter the card uses, so the assertions hold whatever ICU the
// machine running the tests carries; `norm` turns its U+00A0 into a plain space
// like the page text it is compared with.
const money = (n: number) => norm(`${n.toLocaleString("uz-UZ")} so'm`);

function norm(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

function render(monthCharges: MonthCharges | null, salaryMonth?: string): string {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // `undefined` twice: no branch is selected in a bare store, and no refreshKey.
  client.setQueryData(
    ["financial-overview", undefined, START, END, undefined],
    overview(monthCharges, salaryMonth),
  );
  return norm(
    renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client },
        createElement(
          TooltipProvider,
          null,
          createElement(PaymentsOverview, { startDate: START, endDate: END }),
        ),
      ),
    ),
  );
}

// A monthly-payment month (ADR-0058) leads with the month's own bill, and the
// title names that month: a period of several months shows its FIRST month's
// bill, which «Bu oy hisoblandi» used to read as the whole period's. An older
// month keeps «Oy oxiriga kutilyapti». Neither shows the two rows A2.3 removed:
// «Hisoblangan darslar» (always wrong) and «Tushgan tushum» (the «Tushumlar»
// card above it already says the same).
describe("PaymentsOverview — the month card", () => {
  it("a monthly-payment month is titled with its month and shows hisoblandi, to'landi and qoldi from the server", () => {
    const text = render(charges);

    expect(text).toContain("Oktabr to'lovlari");
    expect(text).toContain(`Hisoblandi ${money(900_000)}`);
    expect(text).toContain(`To'landi ${money(350_000)} (38.9%)`);
    expect(text).toContain(`Qoldi ${money(550_000)}`);
    // «Bu oy» is gone from the row and «Oy to'lovlari» from the title: the month is named.
    expect(text).not.toContain("Bu oy hisoblandi");
    expect(text).not.toContain("Oy to'lovlari");
    // The expectation is not drawn beside it, and its figure is nowhere on the page.
    expect(text).not.toContain("Oy oxiriga kutilyapti");
    expect(text).not.toContain(money(EXPECTED_MONTH_END));
  });

  it("names the month the server sent, not the dates the page asked for", () => {
    // The page asks for October; this bill is September's (a period that
    // starts in September), and the title says so.
    const text = render({ ...charges, month: "2026-09" });

    expect(text).toContain("Sentabr to'lovlari");
    expect(text).not.toContain("Oktabr to'lovlari");
  });

  it("an older month keeps «Oy oxiriga kutilyapti» and has no month bill", () => {
    const text = render(null);

    expect(text).toContain("Tushum ko'rsatkichlari");
    expect(text).toContain(`Oy oxiriga kutilyapti ${money(EXPECTED_MONTH_END)}`);
    expect(text).not.toContain("Hisoblandi");
    expect(text).not.toContain("Bu oy hisoblandi");
  });

  it("neither month shows the two rows that were removed", () => {
    for (const monthCharges of [charges, null]) {
      const text = render(monthCharges);

      expect(text).not.toContain("Hisoblangan darslar");
      expect(text).not.toContain("Tushgan tushum");
      // «Tushumlar» stays: that is where the received money is read.
      expect(text).toContain("Tushumlar");
    }
  });

  it("nothing charged has no percentage to print", () => {
    const text = render({
      ...charges,
      charged: 0,
      paid: 0,
      unpaid: 0,
      paidPct: null,
    });

    expect(text).toContain(`To'landi ${money(0)}`);
    expect(text).not.toMatch(/\(\d+(\.\d+)?%\)/);
  });
});

// «Ustoz oyliklari» sits beside «Oktabr to'lovlari» and names its month from the
// same table (`salary-utils`): it kept a local one that spelled «Oktyabr» and
// «Sentyabr», so one screen wrote the same month two ways.
describe("PaymentsOverview — the salary card's month", () => {
  it("names the server's month the way the month card does", () => {
    const text = render(charges, "2026-10");

    expect(text).toContain("Oktabr to'lovlari");
    expect(text).toContain("Oktabr 2026 uchun hisoblangan");
    expect(text).not.toContain("Oktyabr");
  });

  it("spells September «Sentabr» too", () => {
    const text = render({ ...charges, month: "2026-09" }, "2026-09");

    expect(text).toContain("Sentabr to'lovlari");
    expect(text).toContain("Sentabr 2026 uchun hisoblangan");
    expect(text).not.toContain("Sentyabr");
  });

  it("reads «Shu oy» when the server sent no month", () => {
    const text = render(charges);

    expect(text).toContain("Shu oy uchun hisoblangan");
  });
});
