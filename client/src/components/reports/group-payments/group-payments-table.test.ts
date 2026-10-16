import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { formatPrice } from "@/lib/format-utils";
import { PaymentsPager } from "@/components/payments/list/payments-table";
import { GroupPaymentsTable } from "./group-payments-table";
import type { GpRow } from "./group-payments-types";

const raw = (el: ReturnType<typeof createElement>) => renderToStaticMarkup(el);
const norm = (s: string) => s.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const price = (n: number) => norm(formatPrice(n));
const noop = () => {};

// Made-up groups.
const ROWS: GpRow[] = [
  { id: "g2", name: "B1-02", sub: "Nemis tili B1", teachers: [], marks: ["yopilgan"], students: 1, charged: 300_000, paid: 60_000, unpaid: 240_000, paidPct: 20, unpaidStudents: 1 },
  { id: "g1", name: "A1-01", sub: "Nemis tili A1", teachers: ["Aziza Rahimova", "Olim Karimov"], marks: [], students: 2, charged: 900_000, paid: 540_000, unpaid: 360_000, paidPct: 60, unpaidStudents: 1 },
  { id: "g4", name: "A2-01", sub: "Nemis tili A2", teachers: ["Aziza Rahimova"], marks: ["ochirilgan"], students: 1, charged: 300_000, paid: 300_000, unpaid: 0, paidPct: 100, unpaidStudents: 0 },
];
const table = (over: Partial<Parameters<typeof GroupPaymentsTable>[0]> = {}) =>
  createElement(GroupPaymentsTable, { kesim: "guruh", rows: ROWS, loading: false, offset: 0, emptyMonth: false, onOpen: noop, ...over });

describe("GroupPaymentsTable (spec B5 §3.5)", () => {
  it("Guruhlar: # first, then Guruh, Ustoz and the figures", () => {
    expect(norm(raw(table())).trimStart().startsWith("# Guruh Ustoz O'quvchi Hisoblandi To'landi Qoldi Foiz To'lamagan")).toBe(true);
  });
  it("Ustozlar and Kurslar: no Ustoz column, their own first column", () => {
    expect(norm(raw(table({ kesim: "ustoz" }))).trimStart().startsWith("# Ustoz O'quvchi Hisoblandi")).toBe(true);
    expect(norm(raw(table({ kesim: "kurs" }))).trimStart().startsWith("# Kurs O'quvchi Hisoblandi")).toBe(true);
  });
  it("a row: name with the course under it, teachers by comma, pills, numbering from the offset", () => {
    const text = norm(raw(table({ offset: 10 })));
    expect(text).toContain("11 B1-02 yopilgan Nemis tili B1");
    expect(text).toContain("12 A1-01 Nemis tili A1 Aziza Rahimova, Olim Karimov 2");
    expect(text).toContain("A2-01 o'chirilgan");
  });
  it("Qoldi red when something is left, a muted 0 otherwise; the percentage whole", () => {
    const html = raw(table());
    expect(html).toContain(`text-destructive">${formatPrice(240_000)}`);
    expect(norm(html)).toContain(`${price(300_000)} ${price(300_000)} 0 100%`);
    expect(norm(html)).toContain("20%");
  });
  it("only Guruhlar rows open the drawer", () => {
    expect(raw(table())).toContain('tabindex="0"');
    expect(raw(table({ kesim: "ustoz" }))).not.toContain('tabindex="0"');
  });
  it("empty: a month without charges, or a filter without results with «Tozalash»", () => {
    expect(norm(raw(table({ rows: [], emptyMonth: true })))).toContain("Bu oyda hisob yozilmagan");
    const none = norm(raw(table({ rows: [], onClear: noop })));
    expect(none).toContain("Hech narsa topilmadi");
    expect(none).toContain("Tozalash");
  });
  it("loading draws skeleton rows, never the empty text", () => {
    const html = raw(table({ rows: undefined, loading: true }));
    expect(html).toContain('data-slot="skeleton"');
    expect(norm(html)).not.toContain("Hech narsa topilmadi");
  });
});

describe("PaymentsPager with the report's sizes", () => {
  it("«1–10 / 46» and «10 ta»", () => {
    const text = norm(raw(createElement(PaymentsPager, { page: 1, pageSize: 10, total: 46, sizes: [10, 20, 30, 40, 50], sizeLabel: "Sahifadagi qatorlar soni", onPage: noop, onPageSize: noop })));
    expect(text).toContain("1–10 / 46");
    expect(text).toContain("10 ta");
  });
});
