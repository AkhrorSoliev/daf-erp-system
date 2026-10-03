import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/payments/overview",
  useRouter: () => ({ push() {}, replace() {}, back() {}, prefetch() {} }),
  useSearchParams: () => new URLSearchParams(),
}));

import { CashCard } from "./cash-card";
import { IncomeBreakdown, incomeSummary } from "./income-dialog";
import { MonthsTable } from "./months-table";
import { ProfitBreakdown } from "./profit-dialog";
import { ProfitCard } from "./profit-card";
import { SalaryCard } from "./salary-card";
import type { FinancialOverview, IncomeAttribution, ProfitComposition, TrendRow } from "./types";

function norm(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}
const money = (n: number) => norm(`${n.toLocaleString("uz-UZ")} so'm`);

/** The amount printed right after `label`, as a number. */
function amountAfter(text: string, label: string): number {
  const m = text.match(new RegExp(`${label} (-?[\\d ]+) so'm`));
  if (!m) throw new Error(`no amount after «${label}»`);
  return Number(m[1].replace(/ /g, ""));
}

// 150.4 + 15.6 + 16.7 = 182.7 (mln); the late months add up to the late part.
const ATTRIBUTION: IncomeAttribution = {
  total: 182_700_000,
  currentMonth: 150_400_000,
  advance: 15_600_000,
  advanceStudents: 31,
  lateTotal: 16_700_000,
  late: [
    { monthKey: "2026-09", label: "Sentabr 2026", amount: 12_100_000 },
    { monthKey: "2026-08", label: "Avgust 2026", amount: 4_600_000 },
  ],
  payerCount: 409,
  paymentCount: 612,
  latePaymentCount: 58,
  lateStudentCount: 41,
};

const OVERVIEW: FinancialOverview = {
  income: {
    actual: 182_700_000,
    paymentCount: 612,
    byMethod: [
      { method: "CASH", amount: 120_000_000, count: 400 },
      { method: "CLICK", amount: 62_700_000, count: 212 },
    ],
    yesterday: { date: "2026-10-14", amount: 2_200_000 },
  },
  monthCharges: null,
  // Today's debt: no block in this file reads it.
  debtSplit: {
    studying: { total: 0, count: 0, currentMonth: 0, older: 0 },
    notStudying: { total: 0, count: 0 },
  },
  salary: {
    computed: {
      month: "2026-10",
      hasLessonData: true,
      fullDeserved: 80_400_000,
      netToPay: 66_600_000,
      advances: 13_800_000,
      staff: { monthly: 14_900_000, advances: 0, netToPay: 14_900_000 },
    },
  },
};

// 175.4 − 80.4 − 14.9 − 12.6 − 0.5 = 67.0 (mln).
const COMPOSITION: ProfitComposition = {
  month: "2026-10",
  netProfit: 67_000_000,
  revenue: { total: 175_400_000 },
  withdrawals: { total: 0 },
  teachers: { total: 80_400_000 },
  staff: { total: 14_900_000 },
  expenses: { total: 12_600_000 },
  refunds: 500_000,
  forecast: { expectedNetProfit: 58_000_000 },
};

function render(element: ReactElement, seed: (client: QueryClient) => void = () => {}): string {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false } } });
  seed(client);
  return norm(renderToStaticMarkup(createElement(QueryClientProvider, { client }, element)));
}

const seedMonth =
  (month: string, overview: FinancialOverview = OVERVIEW, composition: ProfitComposition = COMPOSITION) =>
  (client: QueryClient) => {
    client.setQueryData(["financial-overview", undefined, month], overview);
    client.setQueryData(["income-month-attribution", undefined, month], ATTRIBUTION);
    client.setQueryData(["profit-composition", undefined, month], composition);
  };

describe("CashCard", () => {
  it("prints the month's cash, the old-debt part and yesterday in the current month", () => {
    const text = render(createElement(CashCard, { month: "2026-10", isCurrent: true }), seedMonth("2026-10"));

    expect(text).toContain(`Kassaga tushdi ${money(182_700_000)}`);
    expect(text).toContain(`shundan eski qarzlardan ${money(16_700_000)}`);
    expect(text).toContain(`kecha (14.10) ${money(2_200_000)}`);
    expect(text).toContain("Qayerdan keldi →");
  });

  it("a past month has no «kecha», and no old debt leaves its line out", () => {
    const text = render(createElement(CashCard, { month: "2026-09", isCurrent: false }), (client) => {
      seedMonth("2026-09")(client);
      client.setQueryData(["income-month-attribution", undefined, "2026-09"], { ...ATTRIBUTION, lateTotal: 0, late: [] });
    });

    expect(text).not.toContain("kecha");
    expect(text).not.toContain("shundan eski qarzlardan");
  });
});

describe("«Qayerdan keldi»", () => {
  it("prints the three parts and they add up to the cash", () => {
    const text = render(createElement(IncomeBreakdown, { month: "2026-10", data: ATTRIBUTION, byMethod: OVERVIEW.income.byMethod }));

    expect(text).toContain(`Oktabr oyi to'lovi ${money(150_400_000)}`);
    expect(text).toContain(`Noyabr uchun oldindan ${money(15_600_000)} 31 o'quvchining balansida turibdi`);
    expect(text).toContain(`Eski qarzlar uchun ${money(16_700_000)} 58 ta to'lov, 41 o'quvchi`);
    expect(text).toContain(`Sentabr 2026 qarzi ${money(12_100_000)}`);
    expect(text).toContain(`Avgust 2026 qarzi ${money(4_600_000)}`);
    expect(
      amountAfter(text, "Oktabr oyi to'lovi") + amountAfter(text, "Noyabr uchun oldindan") + amountAfter(text, "Eski qarzlar uchun"),
    ).toBe(ATTRIBUTION.total);
    expect(text).toContain(`Qanday to'landi Naqd · ${money(120_000_000)} Click · ${money(62_700_000)}`);
  });

  it("leaves out a part that is 0", () => {
    const text = render(
      createElement(IncomeBreakdown, { month: "2026-10", data: { ...ATTRIBUTION, advance: 0, total: 167_100_000 }, byMethod: [] }),
    );

    expect(text).not.toContain("uchun oldindan");
    expect(text).not.toContain("Qanday to'landi");
  });

  it("the sub-line counts payments and students; an older server's missing count is left out", () => {
    expect(norm(incomeSummary(ATTRIBUTION))).toBe(`Jami ${money(182_700_000)} · 612 ta to'lov · 409 o'quvchi`);
    expect(norm(incomeSummary({ ...ATTRIBUTION, paymentCount: undefined }))).toBe(`Jami ${money(182_700_000)} · 409 o'quvchi`);
  });
});

describe("SalaryCard", () => {
  it("adds the teachers' full pay and the staff's monthly pay, with the advance and what is left to give", () => {
    const text = render(createElement(SalaryCard, { month: "2026-10", isCurrent: true }), seedMonth("2026-10"));

    expect(text).toContain(`Oyliklar ${money(95_300_000)}`);
    expect(text).toContain(`ustozlar ${money(80_400_000)} · xodimlar ${money(14_900_000)}`);
    expect(text).toContain(`avans berilgan ${money(13_800_000)}`);
    expect(text).toContain(`oy oxirida beriladi ${money(81_500_000)}`);
    expect(text).not.toContain("o'tish oyi");
  });

  it("a past month says «avansdan keyin»", () => {
    const text = render(createElement(SalaryCard, { month: "2026-09", isCurrent: false }), seedMonth("2026-09"));

    expect(text).toContain(`avansdan keyin ${money(81_500_000)}`);
    expect(text).not.toContain("oy oxirida beriladi");
  });

  it("a month without per-lesson data shows «—» for the teachers and the total, and says «o'tish oyi»", () => {
    const may: FinancialOverview = {
      ...OVERVIEW,
      salary: {
        computed: {
          month: "2026-05",
          hasLessonData: false,
          fullDeserved: 0,
          netToPay: 52_000_000,
          advances: 3_000_000,
          staff: { monthly: 14_900_000, advances: 0, netToPay: 14_900_000 },
        },
      },
    };
    const text = render(createElement(SalaryCard, { month: "2026-05", isCurrent: false }), seedMonth("2026-05", may));

    expect(text).toContain(`Oyliklar — ustozlar — · xodimlar ${money(14_900_000)}`);
    expect(text).toContain("o'tish oyi");
  });
});

describe("ProfitCard", () => {
  it("prints the profit with the lines it comes from, and they add up", () => {
    const text = render(createElement(ProfitCard, { month: "2026-10", isCurrent: true }), seedMonth("2026-10"));

    expect(text).toContain(`Foyda ${money(67_000_000)}`);
    expect(text).toContain(`darslar puli ${money(175_400_000)}`);
    expect(text).toContain(`chiqimlar ${money(-108_400_000)}`);
    expect(text).toContain(`oy oxiriga taxminan ${money(58_000_000)}`);
    expect(text).not.toContain("balansdan yechib olingan");
    expect(amountAfter(text, "darslar puli") + amountAfter(text, "chiqimlar")).toBe(amountAfter(text, "Foyda"));
  });

  it("shows a withdrawal when there is one, and no month-end estimate for a past month", () => {
    const withWithdrawal = { ...COMPOSITION, withdrawals: { total: 1_000_000 }, netProfit: 68_000_000 };
    const text = render(
      createElement(ProfitCard, { month: "2026-09", isCurrent: false }),
      seedMonth("2026-09", OVERVIEW, withWithdrawal),
    );

    expect(text).toContain(`balansdan yechib olingan ${money(1_000_000)}`);
    expect(text).not.toContain("oy oxiriga taxminan");
  });
});

describe("«Qanday hisoblandi»", () => {
  it("is one equation whose lines add up to the profit", () => {
    const text = render(createElement(ProfitBreakdown, { month: "2026-10", composition: COMPOSITION }));
    const lines = [
      "O'tilgan darslar puli",
      "Ustozlar oyligi",
      "Xodimlar oyligi",
      "Boshqa xarajatlar",
      "Qaytarilgan pul",
    ].map((label) => amountAfter(text, label));

    expect(lines.reduce((s, a) => s + a, 0)).toBe(amountAfter(text, "Foyda"));
    expect(text).not.toContain("Balansdan yechib olingan");
  });

  it("says the teacher pay matches the Ish haqi page from 2026-07 only", () => {
    const check = "Ustozlar oyligi — Ish haqi sahifasidagi jami bilan bir xil";
    expect(render(createElement(ProfitBreakdown, { month: "2026-07", composition: COMPOSITION }))).toContain(check);
    expect(render(createElement(ProfitBreakdown, { month: "2026-06", composition: COMPOSITION }))).not.toContain(check);
  });
});

describe("MonthsTable", () => {
  const TREND: TrendRow[] = [
    { monthKey: "2026-05", income: 160_000_000, profit: 20_000_000, profitBasis: "kanonik" },
    { monthKey: "2026-08", income: 170_000_000, profit: 99_000_000, profitBasis: "kassa" },
    { monthKey: "2026-09", income: 175_000_000, profit: 60_000_000, profitBasis: "kanonik" },
    { monthKey: "2026-10", income: 182_700_000, profit: 67_000_000, profitBasis: "kanonik" },
  ];

  it("lists the months newest first with the canonical profit, «—» where it failed, and the notes", () => {
    const text = render(createElement(MonthsTable, { month: "2026-10", current: "2026-10" }), (client) =>
      client.setQueryData(["financial-trend", undefined, "2026-10"], TREND),
    );

    expect(text.indexOf("Oktabr 2026")).toBeLessThan(text.indexOf("Sentabr 2026"));
    expect(text).toContain(`Oktabr 2026 ${money(182_700_000)} ${money(67_000_000)} oy tugamagan`);
    expect(text).toContain(`Sentabr 2026 ${money(175_000_000)} ${money(60_000_000)}`);
    expect(text).toContain(`Avgust 2026 ${money(170_000_000)} — 12 talik tizim`);
    expect(text).not.toContain(money(99_000_000));
    expect(text).toContain(`May 2026 ${money(160_000_000)} ${money(20_000_000)} 12 talik tizim`);
  });
});
