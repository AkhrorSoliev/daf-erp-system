import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { formatPrice } from "@/lib/format-utils";
import { ADVANCE_NOTE } from "./expenses-format";
import { ExpensesFilterBar, firstPage } from "./expenses-filter-bar";
import { ExpensesTable, rowActions } from "./expenses-table";
import { EXPENSES_CLEARED, EXPENSES_SCHEMA, type ExpensesFilters } from "./expenses-url";
import type { ExpenseRow } from "./expenses-types";

const raw = (el: ReturnType<typeof createElement>) => renderToStaticMarkup(el);
const norm = (s: string) => s.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const text = (el: ReturnType<typeof createElement>) => norm(raw(el));
const DEFAULTS = Object.fromEntries(Object.entries(EXPENSES_SCHEMA).map(([k, v]) => [k, v.defaultValue])) as unknown as ExpensesFilters;
const noop = () => {};

// Made-up rows.
const ROWS: ExpenseRow[] = [
  { id: "e1", category: "OTHER", paymentMethod: "CASH", amount: 450_000, description: "Stullar", date: "2026-10-05T00:00:00.000Z", branchId: 1, receiptUrl: null,
    createdAt: "2026-10-05T09:30:00.000Z", createdBy: { id: 10001, firstName: "Ism", lastName: "Aliyev" }, hint: "EQUIPMENT" },
  { id: "e2", category: "RENT", paymentMethod: "CARD", amount: 5_000_000, description: "Ijara", date: "2026-10-03T00:00:00.000Z", branchId: 1, receiptUrl: null,
    createdAt: "2026-10-03T05:00:00.000Z", createdBy: { id: 10002, firstName: "Ism", lastName: "Karimov" }, hint: null },
];
const table = (over: Partial<Parameters<typeof ExpensesTable>[0]> = {}) =>
  createElement(ExpensesTable, { rows: ROWS, loading: false, offset: 0, emptyMonth: false, canManage: true, onEdit: noop, onHistory: noop, onDelete: noop, ...over });

describe("ExpensesTable (spec B6 §3.6)", () => {
  it("# first, then Sana, Turkum, Tavsif, Summa, To'lov turi, Kim kiritgan", () => {
    expect(text(table()).trimStart().startsWith("# Sana Turkum Tavsif Summa To'lov turi Kim kiritgan")).toBe(true);
  });
  it("a row: numbering from the offset, the day, the badge, the hint pill, the amount, «Naqd», the author and when", () => {
    const t = text(table({ offset: 10 }));
    expect(t).toContain(norm(`11 05.10.2026 Boshqa Stullar Jihozlar turkumi emasmi? ${formatPrice(450_000)} so'm Naqd Ism Aliyev 05.10.2026, 14:30`));
    expect(t).toContain(norm(`12 03.10.2026 Ijara Ijara ${formatPrice(5_000_000)} so'm Karta Ism Karimov 03.10.2026, 10:00`));
  });
  it("the hint pill only where the server sent one", () => {
    expect(text(table()).match(/turkumi emasmi\?/g)?.length).toBe(1);
  });
  it("empty: a month without expenses, or a filter without results with «Tozalash»", () => {
    expect(text(table({ rows: [], emptyMonth: true }))).toContain("Bu oyda xarajat yozilmagan");
    const none = text(table({ rows: [], onClear: noop }));
    expect(none).toContain("Bu tanlovda xarajat yo'q");
    expect(none).toContain("Tozalash");
  });
  it("loading draws skeleton rows, never the empty text", () => {
    const html = raw(table({ rows: undefined, loading: true }));
    expect(html).toContain('data-slot="skeleton"');
    expect(norm(html)).not.toContain("xarajat yo'q");
  });
  it("the advance note under the table (CEO decision 6)", () => {
    expect(text(table())).toContain(ADVANCE_NOTE);
  });
  it("«⋯»: Tahrirlash and O'chirish only with expenses.manage, Tarix always", () => {
    expect(rowActions(true)).toEqual(["edit", "history", "delete"]);
    expect(rowActions(false)).toEqual(["history"]);
  });
});

describe("ExpensesFilterBar (spec B6 §3.5)", () => {
  const bar = (filters: Partial<ExpensesFilters> = {}, selection: { count: number; amount: number } | null = null) =>
    createElement(ExpensesFilterBar, { filters: { ...DEFAULTS, ...filters }, creators: [{ id: 10001, firstName: "Ism", lastName: "Aliyev" }], selection, onChange: noop });
  it("search, categories, method and «Kim kiritgan»; no «Tozalash» without a filter", () => {
    const html = raw(bar());
    expect(html).toContain('placeholder="Tavsif bo&#x27;yicha qidirish"');
    const t = norm(html);
    expect(t).toContain("Barcha turkumlar");
    expect(t).toContain("Naqd va karta");
    expect(t).toContain("Kim kiritgan: hammasi");
    expect(t).not.toContain("Tozalash");
  });
  it("a chosen method is a filter: «Tozalash» shows", () => {
    expect(text(bar({ usul: "naqd" }))).toContain("Tozalash");
  });
  it("«Tanlangan: N ta · X so'm» from the list's answer", () => {
    expect(text(bar({}, { count: 7, amount: 1_250_000 }))).toContain(norm(`Tanlangan: 7 ta · ${formatPrice(1_250_000)} so'm`));
  });
});

describe("stale rows (a kept previous answer)", () => {
  it("an empty stale answer is a skeleton, no empty text and no «Tozalash»", () => {
    const html = raw(table({ rows: [], stale: true, onClear: noop }));
    expect(html).toContain('data-slot="skeleton"');
    expect(norm(html)).not.toContain("xarajat yo'q");
    expect(norm(html)).not.toContain("Tozalash");
  });
  it("stale rows are dimmed and inert; fresh rows are not", () => {
    const stale = raw(table({ stale: true }));
    expect(stale).toContain("inert");
    expect(stale).toContain("opacity-60");
    expect(raw(table())).not.toContain("inert");
  });
  it("the last header cell is named", () => {
    expect(text(table()).trimStart().startsWith("# Sana Turkum Tavsif Summa To'lov turi Kim kiritgan Amallar")).toBe(true);
  });
});

describe("every filter change returns to page 1", () => {
  it("firstPage adds sahifa: 1 to a filter update and to «Tozalash»", () => {
    const calls: unknown[] = [];
    const change = firstPage((u) => calls.push(u));
    change({ q: "ijara" });
    change({ turkum: ["RENT"] });
    change(EXPENSES_CLEARED);
    expect(calls).toEqual([{ q: "ijara", sahifa: 1 }, { turkum: ["RENT"], sahifa: 1 }, { ...EXPENSES_CLEARED, sahifa: 1 }]);
  });
});
