import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import { formatPrice } from "@/lib/format-utils";
import { IncomeAttributionPanel } from "./income-attribution-panel";
import type { MonthCharges } from "./payments-overview";

const charges: MonthCharges = {
  month: "2026-10",
  charged: 900_000,
  paid: 350_000,
  unpaid: 550_000,
  paidPct: 38.9,
  students: 2,
};

// The bill's line leads with the month it is for (the server's `month`), so a
// period of several months cannot be read as one bill covering all of them.
const BILL = "Oktabr hisobi";

const attribution = (start: string, end: string) => ({
  period: { start, end },
  monthKey: start.slice(0, 7),
  currentLabel: "Oktyabr 2026",
  total: 1_000_000,
  currentMonth: 700_000,
  lateTotal: 300_000,
  late: [{ monthKey: "2026-09", label: "Sentyabr 2026", amount: 300_000 }],
  payerCount: 5,
  lessonsValue: 800_000,
  collectionPct: 87.5,
});

/** Visible text of the panel over a cache that already holds the attribution. */
function render(
  props: Partial<ComponentProps<typeof IncomeAttributionPanel>> = {},
  range: [string, string] = ["2026-10-01", "2026-10-31"],
): string {
  const [startDate, endDate] = range;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // `undefined` is the branch id: no branch is selected in a bare store.
  client.setQueryData(
    ["income-month-attribution", undefined, startDate, endDate],
    attribution(startDate, endDate),
  );
  return norm(
    renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client },
        createElement(
          TooltipProvider,
          null,
          createElement(IncomeAttributionPanel, { startDate, endDate, ...props }),
        ),
      ),
    ),
  );
}

function norm(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

// One collection measure per single month, never two: «To'landi» in a monthly-
// payment month (ADR-0058), «Oy rejasidan yig'ildi» before it, and the
// lessons-held «Yig'im» only where neither applies.
describe("IncomeAttributionPanel — which collection measure shows", () => {
  it("a monthly-payment month shows the month's bill, paid and unpaid, and neither older measure", () => {
    const text = render({ monthCharges: charges, expectedMonthEnd: 1_200_000 });

    expect(text).toContain(
      norm(
        `${BILL} ${formatPrice(900_000)} so'm — shundan ${formatPrice(350_000)} so'm to'landi, ${formatPrice(550_000)} so'm qoldi`,
      ),
    );
    expect(text).toContain("38.9%");
    expect(text).not.toContain("Oy hisobi");
    expect(text).not.toContain("Oy rejasidan yig'ildi");
    expect(text).not.toContain("Yig'im");
  });

  it("names the month the server sent, not the dates the page asked for", () => {
    // The panel's period is October; this bill is September's.
    const text = render({ monthCharges: { ...charges, month: "2026-09" } });

    expect(text).toContain("Sentabr hisobi");
    expect(text).not.toContain(BILL);
  });

  it("a monthly-payment month with no month plan shows no lessons-held fallback beside it", () => {
    // `expectedMonthEnd` is 0 when nothing is scheduled: the plan block hides
    // itself, and the fallback must not take its place next to «To'landi».
    for (const expectedMonthEnd of [0, undefined]) {
      const text = render({ monthCharges: charges, expectedMonthEnd });

      expect(text).toContain(BILL);
      expect(text).not.toContain("Yig'im");
    }
  });

  it("an older month keeps the month plan", () => {
    const text = render({ monthCharges: null, expectedMonthEnd: 1_200_000 });

    expect(text).toContain("Oy rejasidan yig'ildi");
    expect(text).not.toContain(BILL);
    expect(text).not.toContain("Yig'im");
  });

  it("a single month with neither falls back to the lessons held", () => {
    const text = render({ monthCharges: null });

    expect(text).toContain("Yig'im");
    expect(text).not.toContain("Oy rejasidan yig'ildi");
    expect(text).not.toContain(BILL);
  });

  it("a range over several months shows no month's bill, even when its first month has one", () => {
    const text = render(
      { monthCharges: charges, expectedMonthEnd: 1_200_000 },
      ["2026-09-01", "2026-10-31"],
    );

    expect(text).toContain("Yig'im");
    expect(text).not.toContain(BILL);
    expect(text).not.toContain("Oy rejasidan yig'ildi");
  });

  it("nothing charged (no percentage) reads 0%, not blank", () => {
    const text = render({
      monthCharges: { ...charges, charged: 0, paid: 0, unpaid: 0, paidPct: null },
    });

    expect(text).toContain("To'landi 0%");
  });
});
