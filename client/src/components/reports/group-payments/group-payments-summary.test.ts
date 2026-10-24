import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { formatPrice } from "@/lib/format-utils";
import { GroupPaymentsFilterBar } from "./group-payments-filter-bar";
import { GroupPaymentsSummary } from "./group-payments-summary";
import { GROUP_PAYMENTS_SCHEMA, type GroupPaymentsFilters } from "./group-payments-url";
import type { GpSummary } from "./group-payments-types";

const raw = (el: ReturnType<typeof createElement>) => renderToStaticMarkup(el);
const norm = (s: string) => s.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const price = (n: number) => norm(formatPrice(n));
const DEFAULTS = Object.fromEntries(Object.entries(GROUP_PAYMENTS_SCHEMA).map(([k, v]) => [k, v.defaultValue])) as unknown as GroupPaymentsFilters;
const noop = () => {};

// Made-up month.
const SUMMARY: GpSummary = {
  charged: 2_250_000, paid: 1_250_000, unpaid: 1_000_000, paidPct: 55.6, students: 5, unpaidStudents: 3,
  groups: 4, fullyPaidGroups: 1, underHalfGroups: 1, avgGroupPct: 56.7,
};

describe("GroupPaymentsSummary (spec B5 §3.3)", () => {
  it("title, the three figures with their lines, the chips and the green line", () => {
    const text = norm(raw(createElement(GroupPaymentsSummary, { month: "2026-10", summary: SUMMARY })));
    expect(text).toContain("Oktabr oyi to'lovlari — guruhlar kesimida");
    expect(text).toContain(`Hisoblandi ${price(2_250_000)} so'm 4 guruh · 5 o'quvchi`);
    expect(text).toContain(`To'landi ${price(1_250_000)} so'm 56%`);
    expect(text).toContain(`Qoldi ${price(1_000_000)} so'm guruhlarning o'rtachasi 57%`);
    expect(text).toContain("To'liq to'lagan guruh 1");
    expect(text).toContain("Yarmidan kami to'langan 1");
    expect(text).toContain("Umumiy ma'lumotlardagi 1-qator bilan bir xil raqamlar");
  });
  it("a month with no charge says so", () => {
    const text = norm(raw(createElement(GroupPaymentsSummary, { month: "2026-09", summary: { ...SUMMARY, groups: 0, charged: 0, paid: 0, unpaid: 0 } })));
    expect(text).toContain("Bu oyda hisob yozilmagan");
    expect(text).not.toContain("Hisoblandi");
  });
});

describe("GroupPaymentsFilterBar (spec B5 §3.4)", () => {
  it("the cut, the search, the sort and «Faqat qarzi borlar»", () => {
    const html = raw(createElement(GroupPaymentsFilterBar, { filters: DEFAULTS, onChange: noop }));
    const text = norm(html);
    expect(text).toContain("Guruhlar Ustozlar Kurslar");
    expect(html).toContain('placeholder="Guruh, ustoz yoki kurs"');
    expect(text).toContain("Eng past foiz");
    expect(text).toContain("Faqat qarzi borlar");
    expect(html).toContain('aria-checked="false"');
  });
  it("shows the chosen sort and a ticked box", () => {
    const html = raw(createElement(GroupPaymentsFilterBar, { filters: { ...DEFAULTS, tartib: "qoldi", qarzdor: "1" }, onChange: noop }));
    expect(norm(html)).toContain("Eng ko'p qoldi");
    expect(html).toContain('aria-checked="true"');
  });
});
