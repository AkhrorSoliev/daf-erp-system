import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { mln } from "@/components/payments/salary/salary-page-model";
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS } from "./expenses-labels";
import { CATEGORY_HINT, MISSING_FOOTNOTE, SAME_AS_PROFIT } from "./expenses-format";
import { ExpensesHeader } from "./expenses-header";
import { ExpensesMissingCard } from "./expenses-missing-card";
import { ExpensesMonthCard } from "./expenses-month-card";
import type { MonthCategoryRow, MonthSummary } from "./expenses-types";

const raw = (el: ReturnType<typeof createElement>) => renderToStaticMarkup(el);
const norm = (s: string) => s.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const text = (el: ReturnType<typeof createElement>) => norm(raw(el));
const noop = () => {};

// Made-up month: two branches.
const OVER: Partial<Record<string, Partial<MonthCategoryRow>>> = {
  RENT: { amount: 5_000_000, count: 1, lastMonthAmount: 5_000_000 },
  UTILITIES: { amount: 70_000, count: 1, lastMonthAmount: 4_700_000 },
  TAXES: { lastMonthAmount: 1_200_000, notRecorded: true },
};
const SUMMARY: MonthSummary = {
  month: "2026-10", isCurrentMonth: true, total: 5_070_000, count: 2, cashTotal: 5_000_000, cardTotal: 70_000, lastMonthTotal: 10_900_000,
  byCategory: EXPENSE_CATEGORIES.map((category) => ({ category, amount: 0, count: 0, lastMonthAmount: 0, notRecorded: false, ...OVER[category] })),
  missing: [
    { key: "UTILITIES", branchId: 1, branchName: "Markaz", amount: 4_630_000, lastMonthAmount: 4_700_000, thisMonthAmount: 70_000 },
    { key: "TAXES", branchId: 2, branchName: "Shimol", amount: 1_200_000, lastMonthAmount: 1_200_000, thisMonthAmount: 0 },
  ],
  multiBranch: true,
  emptyBranches: [{ id: 2, name: "Shimol" }],
  creators: [{ id: 10001, firstName: "Ism", lastName: "Familiya" }],
};
const card = (over: Partial<MonthSummary> = {}, selected: string[] = []) => createElement(ExpensesMonthCard, { summary: { ...SUMMARY, ...over }, selected, onToggle: noop });
const missing = (over: Partial<MonthSummary> = {}, canManage = true) => createElement(ExpensesMissingCard, { summary: { ...SUMMARY, ...over }, canManage, onWrite: noop });

describe("ExpensesMonthCard (spec B6 §3.4)", () => {
  it("the month's total, its count with cash and card, the green line", () => {
    const t = text(card());
    expect(t).toContain("Oktabr xarajatlari");
    expect(t).toContain(norm(mln(5_070_000)));
    expect(t).toContain(norm(`2 ta · naqd ${mln(5_000_000)} · karta ${mln(70_000)}`));
    expect(t).toContain(SAME_AS_PROFIT);
  });
  it("eight categories in the fixed order, this month against last, «Jami», the hint line", () => {
    const t = text(card());
    expect(t).toContain("Turkum Oktabr Sentabr");
    // From the table header on: the green line above it already says «Boshqa».
    const rows = t.slice(t.indexOf("Turkum Oktabr Sentabr"));
    const at = EXPENSE_CATEGORIES.map((c) => rows.indexOf(EXPENSE_CATEGORY_LABELS[c]));
    expect(at.every((p, i) => p >= 0 && (i === 0 || p > at[i - 1]))).toBe(true);
    expect(t).toContain(norm(`Jami ${mln(5_070_000)} ${mln(10_900_000)}`));
    expect(t).toContain(CATEGORY_HINT);
  });
  it("«yozilmagan» where the server says so", () => {
    expect(text(card())).toContain("Soliqlar yozilmagan");
    expect(text(card({ isCurrentMonth: false, byCategory: SUMMARY.byCategory.map((r) => ({ ...r, notRecorded: false })) }))).not.toContain("yozilmagan");
  });
  it("the picked category is marked; rows are buttons", () => {
    const html = raw(card({}, ["RENT"]));
    expect(html.match(/aria-pressed="true"/g)?.length).toBe(1);
    expect(html.match(/<button/g)?.length).toBe(8);
  });
  it("a month with no expense says so", () => {
    expect(text(card({ count: 0, total: 0, cashTotal: 0, cardTotal: 0 }))).toContain("Bu oyda xarajat yozilmagan");
  });
});

describe("ExpensesMissingCard (spec B6 §3.3)", () => {
  it("the title, each gap with its branch, the empty branch and the footnote", () => {
    const t = text(missing());
    expect(t).toContain("Bu oy hali yozilmagan");
    expect(t).toContain(norm(`Kommunal · Markaz — sentabrda ${mln(4_700_000)} edi, oktabrda hozircha ${mln(70_000)}`));
    expect(t).toContain(norm(`Soliq · Shimol — sentabrda ${mln(1_200_000)} edi`));
    expect(t).toContain("Shimol filiali — bu oy bitta ham xarajat yozilmagan");
    expect(t).toContain(MISSING_FOOTNOTE);
  });
  it("«Yozish» on each gap row only with expenses.manage", () => {
    expect(text(missing()).match(/Yozish/g)?.length).toBe(2);
    expect(text(missing({}, false))).not.toContain("Yozish");
  });
  it("one branch in scope: no branch name", () => {
    expect(text(missing({ multiBranch: false }))).toContain(norm(`Kommunal — sentabrda ${mln(4_700_000)}`));
  });
  it("nothing outside the current month, nothing without a row", () => {
    expect(raw(missing({ isCurrentMonth: false }))).toBe("");
    expect(raw(missing({ missing: [], emptyBranches: [] }))).toBe("");
  });
});

describe("ExpensesHeader (spec B6 §3.2)", () => {
  const header = (canManage: boolean) =>
    createElement(ExpensesHeader, { month: "2026-10", current: "2026-10", canManage, exporting: false, pdfDisabled: false, onMonth: noop, onPdf: noop, onAdd: noop });
  it("title, PDF and «Xarajat qo'shish» for a writer", () => {
    const t = text(header(true));
    expect(t).toContain("Xarajatlar");
    expect(t).toContain("PDF");
    expect(t).toContain("Xarajat qo'shish");
  });
  it("no write button without expenses.manage", () => {
    expect(text(header(false))).not.toContain("Xarajat qo'shish");
  });
});
