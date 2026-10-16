import { describe, expect, it } from "vitest";
import { EXPENSES_CLEARED, EXPENSES_SCHEMA, hasExpenseFilter, listParams, pageMonth, pdfFileName, pdfParams, summaryParams, type ExpensesFilters } from "./expenses-url";

const DEFAULTS = Object.fromEntries(Object.entries(EXPENSES_SCHEMA).map(([k, v]) => [k, v.defaultValue])) as unknown as ExpensesFilters;
const f = (u: Partial<ExpensesFilters> = {}): ExpensesFilters => ({ ...DEFAULTS, ...u });

describe("pageMonth (spec B6 §3.2)", () => {
  it("empty is the current month; from May 2026, never ahead; junk is the current month", () => {
    expect(pageMonth("", "2026-10")).toBe("2026-10");
    expect(pageMonth("2026-05", "2026-10")).toBe("2026-05");
    expect(pageMonth("2026-04", "2026-10")).toBe("2026-05");
    expect(pageMonth("2027-01", "2026-10")).toBe("2026-10");
    expect(pageMonth("oktabr", "2026-10")).toBe("2026-10");
  });
});

describe("listParams (spec B6 §6.2)", () => {
  it("defaults: page 1 of 10; the current month and an absent branch are not sent", () => {
    expect(listParams(f(), "2026-10", undefined)).toEqual({ page: 1, pageSize: 10 });
    expect(listParams(f({ oy: "2026-10" }), "2026-10", 3)).toEqual({ branchId: 3, page: 1, pageSize: 10 });
  });
  it("maps the URL keys to the server's names", () => {
    expect(listParams(f({ oy: "2026-09", q: " ijara ", turkum: ["RENT", "TAXES"], usul: "karta", kim: ["10234", "10567"], sahifa: 2, soni: 20 }), "2026-10", 3)).toEqual({
      branchId: 3, oy: "2026-09", search: "ijara", category: "RENT,TAXES", paymentMethod: "CARD", createdById: "10234,10567", page: 2, pageSize: 20,
    });
    expect(listParams(f({ usul: "naqd" }), "2026-10", undefined).paymentMethod).toBe("CASH");
  });
  it("junk falls back to what the server accepts; the advance is never asked for", () => {
    expect(listParams(f({ turkum: ["TEACHER_ADVANCE", "PARTY"], usul: "pul", kim: ["abc"], sahifa: 0, soni: 15 }), "2026-10", undefined)).toEqual({ page: 1, pageSize: 10 });
  });
});

describe("pdfParams / summaryParams", () => {
  it("the PDF: the list's filters without the page", () => {
    expect(pdfParams(f({ oy: "2026-09", turkum: ["RENT"], sahifa: 4 }), "2026-10", 3)).toEqual({ branchId: 3, oy: "2026-09", category: "RENT" });
  });
  it("the month card follows only the month and the branch", () => {
    expect(summaryParams(f({ oy: "2026-09", q: "x", turkum: ["RENT"], kim: ["10001"] }), "2026-10", 3)).toEqual({ branchId: 3, oy: "2026-09" });
    expect(summaryParams(f(), "2026-10", undefined)).toEqual({});
  });
});

describe("hasExpenseFilter / EXPENSES_CLEARED / pdfFileName", () => {
  it("the month and the page are not filters; search, category, method and author are", () => {
    expect(hasExpenseFilter(f({ oy: "2026-09", sahifa: 3 }))).toBe(false);
    expect(hasExpenseFilter(f({ q: "a" }))).toBe(true);
    expect(hasExpenseFilter(f({ turkum: ["RENT"] }))).toBe(true);
    expect(hasExpenseFilter(f({ usul: "naqd" }))).toBe(true);
    expect(hasExpenseFilter(f({ kim: ["10001"] }))).toBe(true);
    expect(hasExpenseFilter(f({ turkum: ["PARTY"] }))).toBe(false);
  });
  it("«Tozalash» keeps the month", () => {
    expect(EXPENSES_CLEARED).toEqual({ q: "", turkum: [], usul: "", kim: [], sahifa: 1 });
  });
  it("names the file by the month", () => expect(pdfFileName("2026-10")).toBe("xarajatlar-2026-10.pdf"));
});
