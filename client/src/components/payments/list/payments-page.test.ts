import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/payments/list",
  useRouter: () => ({ push() {}, replace() {}, back() {}, prefetch() {} }),
  useSearchParams: () => new URLSearchParams(""),
}));

import { PaymentsFilterBar, HOLAT_OPTIONS, MANBA_OPTIONS, NIMAGA_OPTIONS, qabulOptions } from "./payments-filter-bar";
import { PaymentsPeriodBar } from "./payments-period-bar";
import { PaymentsSummaryCard } from "./payments-summary-card";
import { PAYMENTS_LIST_SCHEMA, type PaymentFilters } from "./payments-url";
import type { PaymentFilterOptions, PaymentSummary } from "./payments-list-types";

const DEFAULTS = Object.fromEntries(Object.entries(PAYMENTS_LIST_SCHEMA).map(([k, v]) => [k, v.defaultValue])) as unknown as PaymentFilters;
const f = (u: Partial<PaymentFilters> = {}): PaymentFilters => ({ ...DEFAULTS, ...u });
const noop = () => {};

const raw = (el: ReturnType<typeof createElement>) => renderToStaticMarkup(el);
const text = (el: ReturnType<typeof createElement>) =>
  raw(el).replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

const OPTIONS: PaymentFilterOptions = {
  groups: [{ id: "g1", name: "A1-01" }],
  teachers: [{ id: 20001, firstName: "Olim", lastName: "Karimov" }],
  courses: [{ id: "c1", name: "Nemis tili A1" }],
  receivers: [{ id: 10002, firstName: "Ism", lastName: "Familiya" }],
};

const SUMMARY: PaymentSummary = {
  period: { start: "2026-10-01", end: "2026-10-31", singleMonth: true, endsOnMonthEnd: true },
  total: 12_345_678,
  paymentCount: 31,
  payerCount: 27,
  parts: { currentMonth: 8_000_000, advance: 3_000_000, lateTotal: 1_345_678, late: [] },
  byMethod: [
    { method: "CLICK", amount: 2_000_000, count: 5 },
    { method: "CASH", amount: 9_000_000, count: 20 },
    { method: "UZUM", amount: 0, count: 0 },
  ],
  online: { amount: 1_500_000, count: 4 },
};

describe("PaymentsPeriodBar", () => {
  it("has the six periods and no date fields until «Oraliq»", () => {
    const t = text(createElement(PaymentsPeriodBar, { filters: f(), onChange: noop }));
    for (const label of ["Bugun", "Kecha", "Bu hafta", "Bu oy", "O'tgan oy", "Oraliq"]) expect(t).toContain(label);
    expect(t).not.toContain("Boshi");
  });

  it("«Oraliq» shows «Boshi» and «Oxiri»; a reversed pair says so", () => {
    const t = text(createElement(PaymentsPeriodBar, { filters: f({ davr: "oraliq" }), onChange: noop }));
    expect(t).toContain("Boshi");
    expect(t).toContain("Oxiri");
    expect(t).not.toContain("Boshi oxiridan keyin bo'lmasin");
    const bad = text(createElement(PaymentsPeriodBar, { filters: f({ davr: "oraliq", dan: "2026-10-09", gacha: "2026-10-02" }), onChange: noop }));
    expect(bad).toContain("Boshi oxiridan keyin bo'lmasin");
  });
});

describe("PaymentsFilterBar", () => {
  const bar = (u: Partial<PaymentFilters> = {}, extra: { initialMoreOpen?: boolean } = {}) =>
    createElement(PaymentsFilterBar, { filters: f(u), options: OPTIONS, onChange: noop, onClear: noop, ...extra });

  it("main row", () => {
    expect(raw(bar())).toContain('placeholder="Ism, telefon, ID yoki kvitansiya raqami"');
    const t = text(bar());
    for (const s of ["Barcha usullar", "Nimaga ketdi: hammasi", "Barcha guruhlar", "Yana filtrlar", "Tozalash"]) expect(t).toContain(s);
    expect(t).not.toContain("Barcha ustozlar");
  });

  it("the button counts the filters inside it while closed", () => {
    expect(text(bar({ ustoz: "20001" }))).toContain("Yana filtrlar · 1");
  });

  it("opened: the second row", () => {
    const t = text(bar({}, { initialMoreOpen: true }));
    for (const s of ["Barcha ustozlar", "Barcha kurslar", "Kim qabul qildi: hammasi", "Manba: hammasi", "Faqat o'tgan to'lovlar"]) expect(t).toContain(s);
    expect(t).not.toContain("Yana filtrlar ·");
  });

  it("option lists", () => {
    expect(NIMAGA_OPTIONS.map((o) => o.label)).toEqual(["Nimaga ketdi: hammasi", "Shu oy to'lovi", "Oldindan", "Eski qarz"]);
    expect(MANBA_OPTIONS.map((o) => o.label)).toEqual(["Manba: hammasi", "Admin kiritgan", "Onlayn avtomatik"]);
    expect(HOLAT_OPTIONS.map((o) => o.label)).toEqual(["Faqat o'tgan to'lovlar", "Bekor qilinganlar", "Hammasi"]);
    expect(qabulOptions(OPTIONS)).toEqual([
      { value: "onlayn", label: "Onlayn" },
      { value: "10002", label: "Ism Familiya" },
    ]);
  });
});

describe("PaymentsSummaryCard", () => {
  const card = (davr: "oy" | "hafta", period = SUMMARY.period, summary = SUMMARY) =>
    createElement(PaymentsSummaryCard, { davr, period, summary, activePart: "", onPart: noop });

  it("«Bu oy»: title, total, counts, badge, three parts", () => {
    const t = text(card("oy"));
    expect(t).toContain("Oktabrda tushgan pul");
    expect(t).toContain("12.3 mln");
    expect(t).toContain("31 ta to'lov · 27 o'quvchi");
    expect(t).toContain("«Kassaga tushdi» kartasidagi raqamning o'zi");
    expect(t).toContain("Oktabr to'lovi 8.0 mln");
    expect(t).toContain("Noyabr uchun oldindan 3.0 mln");
    expect(t).toContain("Eski qarzlar 1.3 mln");
  });

  it("a part that is 0 is not drawn", () => {
    const t = text(card("oy", SUMMARY.period, { ...SUMMARY, parts: { ...SUMMARY.parts, advance: 0 } }));
    expect(t).not.toContain("Noyabr uchun oldindan");
    expect(t).toContain("Oktabr to'lovi");
  });

  it("method chips by amount, 0 not drawn, online chip only with a count", () => {
    const t = text(card("oy"));
    expect(t.indexOf("Naqd")).toBeGreaterThan(-1);
    expect(t.indexOf("Naqd")).toBeLessThan(t.indexOf("Click"));
    expect(t).not.toContain("Uzum");
    expect(t).toContain("shundan onlayn avtomatik 1.5 mln · 4 ta");
    expect(text(card("oy", SUMMARY.period, { ...SUMMARY, online: { amount: 0, count: 0 } }))).not.toContain("shundan onlayn");
  });

  it("another period: no badge, no part chips, methods stay", () => {
    const t = text(card("hafta", { ...SUMMARY.period, start: "2026-10-05", end: "2026-10-11" }));
    expect(t).toContain("Shu hafta tushgan pul");
    expect(t).not.toContain("Kassaga tushdi");
    expect(t).not.toContain("Oktabr to'lovi");
    expect(t).toContain("Naqd");
  });

  it("marks the active part", () => {
    const html = raw(createElement(PaymentsSummaryCard, { davr: "oy", period: SUMMARY.period, summary: SUMMARY, activePart: "oldindan", onPart: noop }));
    expect(html).toMatch(/aria-pressed="true"[^>]*>[^<]*(<[^>]*>)*[^<]*Noyabr/);
  });
});
