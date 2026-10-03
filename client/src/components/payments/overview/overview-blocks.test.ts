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
import { useFinancialOverview, useFinancialTrend, useIncomeAttribution, useProfitComposition } from "./queries";
import { useRecentPayments } from "./recent-payments";
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

// 135.36 + 14.04 + 15.03 = 164.43 (mln); the late months add up to the late part.
const ATTRIBUTION: IncomeAttribution = {
  total: 164_430_000,
  currentMonth: 135_360_000,
  advance: 14_040_000,
  advanceStudents: 31,
  lateTotal: 15_030_000,
  late: [
    { monthKey: "2026-09", label: "Sentabr 2026", amount: 10_890_000 },
    { monthKey: "2026-08", label: "Avgust 2026", amount: 4_140_000 },
  ],
  payerCount: 409,
  paymentCount: 612,
  latePaymentCount: 58,
  lateStudentCount: 41,
};

const OVERVIEW: FinancialOverview = {
  income: {
    actual: 164_430_000,
    paymentCount: 612,
    byMethod: [
      { method: "CASH", amount: 108_000_000, count: 400 },
      { method: "CLICK", amount: 56_430_000, count: 212 },
    ],
    yesterday: { date: "2026-10-14", amount: 1_980_000 },
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
      fullDeserved: 72_360_000,
      netToPay: 59_940_000,
      advances: 12_420_000,
      staff: { monthly: 13_410_000, advances: 0, netToPay: 13_410_000 },
    },
  },
};

// 157.86 − 72.36 − 13.41 − 11.34 − 0.45 = 60.30 (mln).
const COMPOSITION: ProfitComposition = {
  month: "2026-10",
  netProfit: 60_300_000,
  teacherSalaryBasis: "hisoblangan",
  revenue: { total: 157_860_000 },
  withdrawals: { total: 0 },
  teachers: { total: 72_360_000 },
  staff: { total: 13_410_000 },
  expenses: { total: 11_340_000 },
  refunds: 450_000,
  forecast: { expectedNetProfit: 52_200_000 },
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

    expect(text).toContain(`Kassaga tushdi ${money(164_430_000)}`);
    expect(text).toContain(`shundan eski qarzlardan ${money(15_030_000)}`);
    expect(text).toContain(`kecha (14.10) ${money(1_980_000)}`);
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

    expect(text).toContain(`Oktabr oyi to'lovi ${money(135_360_000)}`);
    expect(text).toContain(`Noyabr uchun oldindan ${money(14_040_000)} 31 o'quvchining balansida turibdi`);
    expect(text).toContain(`Eski qarzlar uchun ${money(15_030_000)} 58 ta to'lov, 41 o'quvchi`);
    expect(text).toContain(`Sentabr 2026 qarzi ${money(10_890_000)}`);
    expect(text).toContain(`Avgust 2026 qarzi ${money(4_140_000)}`);
    expect(
      amountAfter(text, "Oktabr oyi to'lovi") + amountAfter(text, "Noyabr uchun oldindan") + amountAfter(text, "Eski qarzlar uchun"),
    ).toBe(ATTRIBUTION.total);
    expect(text).toContain(`Qanday to'landi Naqd · ${money(108_000_000)} Click · ${money(56_430_000)}`);
  });

  it("leaves out a part that is 0", () => {
    const text = render(
      createElement(IncomeBreakdown, { month: "2026-10", data: { ...ATTRIBUTION, advance: 0, total: 150_390_000 }, byMethod: [] }),
    );

    expect(text).not.toContain("uchun oldindan");
    expect(text).not.toContain("Qanday to'landi");
  });

  it("the sub-line counts payments and students; an older server's missing count is left out", () => {
    expect(norm(incomeSummary(ATTRIBUTION))).toBe(`Jami ${money(164_430_000)} · 612 ta to'lov · 409 o'quvchi`);
    expect(norm(incomeSummary({ ...ATTRIBUTION, paymentCount: undefined }))).toBe(`Jami ${money(164_430_000)} · 409 o'quvchi`);
  });
});

describe("SalaryCard", () => {
  it("adds the teachers' full pay and the staff's monthly pay, with the advance and what is left to give", () => {
    const text = render(createElement(SalaryCard, { month: "2026-10", isCurrent: true }), seedMonth("2026-10"));

    expect(text).toContain(`Oyliklar ${money(85_770_000)}`);
    expect(text).toContain(`ustozlar ${money(72_360_000)} · xodimlar ${money(13_410_000)}`);
    expect(text).toContain(`avans berilgan ${money(12_420_000)}`);
    expect(text).toContain(`oy oxirida beriladi ${money(73_350_000)}`);
    expect(text).not.toContain("o'tish oyi");
  });

  it("a past month says «avansdan keyin»", () => {
    const text = render(createElement(SalaryCard, { month: "2026-09", isCurrent: false }), seedMonth("2026-09"));

    expect(text).toContain(`avansdan keyin ${money(73_350_000)}`);
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
          netToPay: 46_800_000,
          advances: 2_700_000,
          staff: { monthly: 13_410_000, advances: 0, netToPay: 13_410_000 },
        },
      },
    };
    const text = render(createElement(SalaryCard, { month: "2026-05", isCurrent: false }), seedMonth("2026-05", may));

    expect(text).toContain(`Oyliklar — ustozlar — · xodimlar ${money(13_410_000)}`);
    expect(text).toContain("o'tish oyi");
  });
});

describe("ProfitCard", () => {
  it("prints the profit with the lines it comes from, and they add up", () => {
    const text = render(createElement(ProfitCard, { month: "2026-10", isCurrent: true }), seedMonth("2026-10"));

    expect(text).toContain(`Foyda ${money(60_300_000)}`);
    expect(text).toContain(`darslar puli ${money(157_860_000)}`);
    expect(text).toContain(`chiqimlar ${money(-97_560_000)}`);
    expect(text).toContain(`oy oxiriga taxminan ${money(52_200_000)}`);
    expect(text).not.toContain("balansdan yechib olingan");
    expect(amountAfter(text, "darslar puli") + amountAfter(text, "chiqimlar")).toBe(amountAfter(text, "Foyda"));
  });

  it("shows a withdrawal when there is one, and no month-end estimate for a past month", () => {
    const withWithdrawal = { ...COMPOSITION, withdrawals: { total: 900_000 }, netProfit: 61_200_000 };
    const text = render(
      createElement(ProfitCard, { month: "2026-09", isCurrent: false }),
      seedMonth("2026-09", OVERVIEW, withWithdrawal),
    );

    expect(text).toContain(`balansdan yechib olingan ${money(900_000)}`);
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

  it("says the teacher pay matches the Ish haqi page from 2026-07 only, and only when it was computed", () => {
    const check = "Ustozlar oyligi — Ish haqi sahifasidagi jami bilan bir xil";
    const breakdown = (month: string, composition: ProfitComposition) =>
      render(createElement(ProfitBreakdown, { month, composition }));

    expect(breakdown("2026-07", COMPOSITION)).toContain(check);
    expect(breakdown("2026-06", COMPOSITION)).not.toContain(check);
    // Cash paid stood in for the teacher leg: not the Ish haqi page's figure.
    expect(breakdown("2026-07", { ...COMPOSITION, teacherSalaryBasis: "naqd" })).not.toContain(check);
    // An older server sends no basis: the line is left out.
    expect(breakdown("2026-07", { ...COMPOSITION, teacherSalaryBasis: undefined })).not.toContain(check);
  });
});

describe("MonthsTable", () => {
  const TREND: TrendRow[] = [
    { monthKey: "2026-05", income: 144_000_000, profit: 18_000_000, profitBasis: "kanonik" },
    { monthKey: "2026-08", income: 153_000_000, profit: 89_100_000, profitBasis: "kassa" },
    { monthKey: "2026-09", income: 157_500_000, profit: 54_000_000, profitBasis: "kanonik" },
    { monthKey: "2026-10", income: 164_430_000, profit: 60_300_000, profitBasis: "kanonik" },
  ];

  it("lists the months newest first with the canonical profit, «—» where it failed, and the notes", () => {
    const text = render(createElement(MonthsTable, { month: "2026-10", current: "2026-10" }), (client) =>
      client.setQueryData(["financial-trend", undefined, "2026-10"], TREND),
    );

    expect(text.indexOf("Oktabr 2026")).toBeLessThan(text.indexOf("Sentabr 2026"));
    expect(text).toContain(`Oktabr 2026 ${money(164_430_000)} ${money(60_300_000)} oy tugamagan`);
    expect(text).toContain(`Sentabr 2026 ${money(157_500_000)} ${money(54_000_000)}`);
    expect(text).toContain(`Avgust 2026 ${money(153_000_000)} — 12 talik tizim`);
    expect(text).not.toContain(money(89_100_000));
    expect(text).toContain(`May 2026 ${money(144_000_000)} ${money(18_000_000)} 12 talik tizim`);
  });
});

describe("Refreshing", () => {
  it("every money block fetches again when the page opens, though the app keeps answers fresh for 5 minutes", () => {
    // The app-wide defaults, as `providers/query-provider.tsx` sets them.
    const client = new QueryClient({
      defaultOptions: { queries: { staleTime: 5 * 60 * 1000, refetchOnWindowFocus: false } },
    });
    seedMonth("2026-10")(client);
    client.setQueryData(["financial-trend", undefined, "2026-10"], []);
    client.setQueryData(["recent-payments", undefined], { data: [], total: 0 });
    // On the server render, `isFetching` says whether the block fetches when it mounts.
    function Probe() {
      const fetching = {
        overview: useFinancialOverview("2026-10").isFetching,
        attribution: useIncomeAttribution("2026-10").isFetching,
        profit: useProfitComposition("2026-10").isFetching,
        trend: useFinancialTrend("2026-10").isFetching,
        recent: useRecentPayments().isFetching,
      };
      return Object.entries(fetching)
        .map(([block, yes]) => `${block} ${yes}`)
        .join(", ");
    }
    const text = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(Probe)));

    expect(text).toBe("overview true, attribution true, profit true, trend true, recent true");
  });
});
