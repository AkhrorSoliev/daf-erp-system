import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { KpiAdminTable } from "./kpi-admin-table";
import { KpiSummaryCards } from "./kpi-summary-cards";
import type { KpiAdminRow, KpiOverview } from "./kpi-types";

const row: KpiAdminRow = {
  userId: 7,
  name: "Test Admin",
  leadPaid: { count: 3, amount: 30000, compare: 1 },
  promiseKept: { count: 0, amount: 0, compare: 2 },
  leadToPaid: { paid: 3, received: 6, pct: 50 },
  promiseRate: { kept: 0, closed: 0, pct: null },
  expired: { count: 2, compare: 0 },
  held: 0,
  total: 30000,
};

const data = (compareAvailable: boolean, compareRecorded = true): KpiOverview => ({
  month: "2026-10",
  compare: "2026-09",
  compareAvailable,
  compareRecorded,
  status: { enabled: true, changedAt: null },
  unownedConversions: 0,
  cards: {
    results: { value: 5, compare: 0 },
    amount: { value: 50000, compare: 0 },
    leadToPaid: { value: 40, compare: 0 },
    forecast: null,
  },
  signals: [],
  daily: [],
  months: [],
  rows: [row],
});

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

describe("KPI overview — compareAvailable", () => {
  it("shows no ▲/▼ and no compare line when the compare month has no data", () => {
    const cards = html(createElement(KpiSummaryCards, { data: data(false), isCurrent: true }));
    const table = html(createElement(KpiAdminTable, { rows: [row], compareAvailable: false, compareRecorded: true, onOpen: () => {} }));
    for (const out of [cards, table]) {
      expect(out).not.toMatch(/[▲▼]/);
      expect(out).not.toContain("taqqoslanayotgan oyga nisbatan");
    }
  });

  it("shows them when it has", () => {
    const cards = html(createElement(KpiSummaryCards, { data: data(true), isCurrent: true }));
    const table = html(createElement(KpiAdminTable, { rows: [row], compareAvailable: true, compareRecorded: true, onOpen: () => {} }));
    expect(cards).toContain("▲ 5");
    expect(table).toContain("▲");
    expect(table).toContain("▼");
  });

  it("prints the unpaid-leads hint only in the current month", () => {
    const hint = "ham hisobda";
    const noPct = { ...data(true), cards: { ...data(true).cards, leadToPaid: { value: null, compare: null } } };
    expect(html(createElement(KpiSummaryCards, { data: noPct, isCurrent: true }))).toContain(hint);
    expect(html(createElement(KpiSummaryCards, { data: noPct, isCurrent: false }))).not.toContain(hint);
  });

  it("numbers the rows from 1 and hides the forecast outside the current month", () => {
    const table = html(createElement(KpiAdminTable, { rows: [row], compareAvailable: true, compareRecorded: true, onOpen: () => {} }));
    expect(table).toContain("border-r text-muted-foreground\">1<");
    expect(html(createElement(KpiSummaryCards, { data: data(true), isCurrent: false }))).not.toContain("Oy oxiriga taxmin");
  });

  it("compares with a month recorded in part only by its figure, with a note — no ▲/▼", () => {
    const cards = html(createElement(KpiSummaryCards, { data: data(true, false), isCurrent: true }));
    const table = html(
      createElement(KpiAdminTable, { rows: [row], compareAvailable: true, compareRecorded: false, onOpen: () => {} }),
    );
    for (const out of [cards, table]) expect(out).not.toMatch(/[▲▼]/);
    expect(cards).toContain("taqqoslanayotgan oyda 0 — u oy 17.10 dan hisoblangan");
  });
});
