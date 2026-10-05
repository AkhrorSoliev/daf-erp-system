import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Which month the URL asks for and who is signed in.
const env = vi.hoisted(() => ({ search: "", roleIds: [1] as number[] }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/payments/overview",
  useRouter: () => ({ push() {}, replace() {}, back() {}, prefetch() {} }),
  useSearchParams: () => new URLSearchParams(env.search),
}));

// A zustand store renders its INITIAL state on the server, so the signed-in
// user comes from the module itself.
vi.mock("@/hooks/use-auth", () => {
  const state = () => ({
    user: { roles: env.roleIds.map((id) => ({ id, name: String(id) })) },
  });
  const useAuth = Object.assign(
    (select: (s: ReturnType<typeof state>) => unknown) => select(state()),
    { getState: state, setState: () => {}, subscribe: () => () => {} },
  );
  return { useAuth };
});

import { TooltipProvider } from "@/components/ui/tooltip";
import { OverviewPage } from "./overview-page";
import type { DebtSplit, FinancialOverview, MonthCharges } from "./types";

function norm(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}
const num = (n: number) => norm(n.toLocaleString("uz-UZ"));
const money = (n: number) => norm(`${n.toLocaleString("uz-UZ")} so'm`);
const pct = (n: number) => norm(`${n.toLocaleString("uz-UZ")}%`);

const OCTOBER: MonthCharges = {
  month: "2026-10",
  charged: 159_300_000,
  paid: 122_310_000,
  unpaid: 36_990_000,
  paidPct: 76.8,
  students: 452,
  unpaidStudents: 219,
};

// The not-studying kinds add up to the total and the count; no figure here is
// the sum of the two debts, which the page must never print.
const SPLIT: DebtSplit = {
  studying: { total: 39_150_000, count: 300, currentMonth: 36_990_000, older: 2_160_000, olderCount: 11 },
  notStudying: {
    total: 51_390_000,
    count: 305,
    byKind: {
      ungrouped: { total: 19_170_000, count: 118 },
      frozen: { total: 17_820_000, count: 91 },
      left: { total: 14_400_000, count: 96 },
    },
  },
};

const overview = (monthCharges: MonthCharges | null, debtSplit: DebtSplit = SPLIT): FinancialOverview => ({
  income: { actual: 164_430_000, paymentCount: 612, byMethod: [], yesterday: { date: "2026-10-14", amount: 1_980_000 } },
  monthCharges,
  debtSplit,
  salary: { computed: null },
});

const PAYMENTS = {
  data: [
    {
      id: "p1",
      amount: 405_000,
      method: "CASH",
      createdAt: "2026-10-15T04:00:00.000Z",
      student: { id: 10501, firstName: "Ali", lastName: "Valiyev", groups: [{ id: "g1", name: "A1-07" }, { id: "g2", name: "B1-02" }] },
      receivedBy: null,
    },
    {
      id: "p2",
      amount: 270_000,
      method: "CLICK",
      createdAt: "2026-10-15T03:00:00.000Z",
      student: { id: 10502, firstName: "Vali", lastName: "Aliyev", groups: [] },
      receivedBy: null,
    },
  ],
  total: 2,
};

function render(opts: { search?: string; roleIds?: number[]; seed?: (client: QueryClient) => void } = {}) {
  env.search = opts.search ?? "";
  env.roleIds = opts.roleIds ?? [1];
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false } } });
  opts.seed?.(client);
  const html = renderToStaticMarkup(
    createElement(QueryClientProvider, { client }, createElement(TooltipProvider, null, createElement(OverviewPage))),
  );
  return { html, text: norm(html), client };
}

// No branch is selected in a bare store, so the branch part of every key is undefined.
const seedMonth = (month: string, answer: FinancialOverview) => (client: QueryClient) => {
  client.setQueryData(["financial-overview", undefined, month], answer);
  client.setQueryData(["recent-payments", undefined], PAYMENTS);
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-15T07:00:00Z")); // 15.10.2026 12:00 in Tashkent
});
afterEach(() => vi.useRealTimers());

describe("OverviewPage — the current month (CEO)", () => {
  it("shows the month's charges with the student counts, and who has not paid", () => {
    const { text, html } = render({ seed: seedMonth("2026-10", overview(OCTOBER)) });

    expect(text).toContain("Umumiy ma'lumotlar");
    expect(html).toContain('data-tour="payment-record"');
    expect(text).toContain("Oktabr oyi to'lovlari");
    expect(text).toContain(`Hisoblandi ${money(159_300_000)} ${num(452)} o'quvchiga`);
    expect(text).toContain(`To'landi ${money(122_310_000)} ${pct(76.8)}`);
    expect(text).toContain(`Qoldi ${money(36_990_000)} ${num(219)} o'quvchi to'lamagan`);
    expect(html).toContain('href="/payments/debt"');
    expect(text).toContain("Kim to'lamagan →");
  });

  it("shows today's debt as two numbers with the three not-studying kinds, never added", () => {
    const { text, html } = render({ seed: seedMonth("2026-10", overview(OCTOBER)) });

    // Each card opens its own tab of the debt page.
    expect(html).toContain('href="/payments/debt?tab=eski"');
    expect(html).toContain('href="/payments/debt?tab=chiqqan"');

    expect(text).toContain(`Eski qarz — o'qiyotganlar ${money(2_160_000)} ${num(11)} o'quvchi · o'tgan oylardan qolgan`);
    expect(text).toContain(`O'qimayotganlar qarzi ${money(51_390_000)} ${num(305)} kishi · undirish ishi`);
    expect(text).toContain(`guruhsiz · ${num(118)} ${money(19_170_000)}`);
    expect(text).toContain(`muzlatilgan · ${num(91)} ${money(17_820_000)}`);
    expect(text).toContain(`ketgan · ${num(96)} ${money(14_400_000)}`);
    expect(text).not.toContain(num(2_160_000 + 51_390_000));
    expect(text).not.toContain(num(39_150_000 + 51_390_000));
  });

  it("lists the recent payments with each student's groups now, «—» without one", () => {
    const { text } = render({ seed: seedMonth("2026-10", overview(OCTOBER)) });

    expect(text).toContain("Oxirgi to'lovlar");
    expect(text).toContain("#10501 Ali Valiyev A1-07, B1-02");
    expect(text).toContain("#10502 Vali Aliyev —");
  });

  it("prints no English abbreviation and no Cyrillic", () => {
    const { text } = render({ seed: seedMonth("2026-10", overview(OCTOBER)) });

    expect(text).not.toMatch(/\b(LTV|CAC|ROI)\b/);
    expect(text).not.toMatch(/[Ѐ-ӿ]/);
  });

  it("against a server older than B1 leaves the new counts out instead of printing them wrong", () => {
    const oldCharges: MonthCharges = { month: "2026-10", charged: 159_300_000, paid: 122_310_000, unpaid: 36_990_000, paidPct: 76.8, students: 452 };
    const oldSplit: DebtSplit = {
      studying: { total: 39_150_000, count: 300, currentMonth: 36_990_000, older: 2_160_000 },
      notStudying: { total: 51_390_000, count: 305 },
    };
    const { text } = render({ seed: seedMonth("2026-10", overview(oldCharges, oldSplit)) });

    expect(text).toContain(`Qoldi ${money(36_990_000)}`);
    expect(text).not.toContain("o'quvchi to'lamagan");
    expect(text).toContain(`Eski qarz — o'qiyotganlar ${money(2_160_000)}`);
    expect(text).not.toContain("o'tgan oylardan qolgan");
    expect(text).not.toContain("guruhsiz");
    expect(text).not.toMatch(/undefined|NaN/);
  });

  it("a failed request blanks the money blocks, not the page", () => {
    const { text } = render({
      seed: (client) => {
        client
          .getQueryCache()
          .build(client, { queryKey: ["financial-overview", undefined, "2026-10"] })
          .setState({ status: "error", error: new Error("boom") });
        client.setQueryData(["recent-payments", undefined], PAYMENTS);
      },
    });

    expect(text).toContain("Ma'lumotni yuklab bo'lmadi");
    expect(text).toContain("Qayta urinish");
    expect(text).not.toContain("Hisoblandi");
    expect(text).toContain("#10501 Ali Valiyev");
  });
});

describe("OverviewPage — a past month", () => {
  it("keeps the month's charges but hides today's debt, the collect link and the recent payments", () => {
    const { text } = render({ search: "month=2026-09", seed: seedMonth("2026-09", overview({ ...OCTOBER, month: "2026-09" })) });

    expect(text).toContain("Sentabr oyi to'lovlari");
    expect(text).not.toContain("Kim to'lamagan");
    expect(text).not.toContain("Eski qarz — o'qiyotganlar");
    expect(text).not.toContain("Oxirgi to'lovlar");
  });

  it("a month before monthly billing says it was the 12-lesson system", () => {
    const { text } = render({ search: "month=2026-08", seed: seedMonth("2026-08", overview(null)) });

    expect(text).toContain("Avgust — 12 talik tizim: oylik hisob yo'q");
    expect(text).not.toContain("Hisoblandi");
  });

  it("reads a month outside the picker's range as the nearest one it allows", () => {
    const { text } = render({ search: "month=2025-12", seed: seedMonth("2026-05", overview(null)) });

    expect(text).toContain("May — 12 talik tizim: oylik hisob yo'q");
  });
});

describe("OverviewPage — Administrator and Cashier", () => {
  it.each([[3], [5]])("role %i sees the title, «To'lov qayd qilish» and the recent payments — and the page asks for no money figure", (role) => {
    const { text, html, client } = render({
      roleIds: [role],
      seed: (c) => c.setQueryData(["recent-payments", undefined], PAYMENTS),
    });

    expect(text).toContain("Umumiy ma'lumotlar");
    expect(text).toContain("To'lov qayd qilish");
    expect(text).toContain("#10501 Ali Valiyev");
    expect(html).not.toContain('aria-label="Oldingi oy"'); // no month picker
    expect(text).not.toContain("to'lovlari");
    expect(client.getQueryCache().findAll({ queryKey: ["financial-overview"] })).toHaveLength(0);
  });
});
