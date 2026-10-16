import { describe, expect, it } from "vitest";
import { excelFileName, excelParams, GROUP_PAYMENTS_SCHEMA, hasGpFilter, pageMonth, rowsParams, type GroupPaymentsFilters } from "./group-payments-url";

const DEFAULTS = Object.fromEntries(Object.entries(GROUP_PAYMENTS_SCHEMA).map(([k, v]) => [k, v.defaultValue])) as unknown as GroupPaymentsFilters;
const f = (u: Partial<GroupPaymentsFilters> = {}): GroupPaymentsFilters => ({ ...DEFAULTS, ...u });

describe("pageMonth", () => {
  it("empty is the current month; the report starts in September 2026 and never runs ahead", () => {
    expect(pageMonth("", "2026-10")).toBe("2026-10");
    expect(pageMonth("2026-09", "2026-10")).toBe("2026-09");
    expect(pageMonth("2026-08", "2026-10")).toBe("2026-09");
    expect(pageMonth("2027-01", "2026-10")).toBe("2026-10");
    expect(pageMonth("oktabr", "2026-10")).toBe("2026-10");
  });
});

describe("rowsParams", () => {
  it("defaults: kesim and sort, page 1 of 10; the current month is not sent", () => {
    expect(rowsParams(f(), "2026-10")).toEqual({ kesim: "guruh", tartib: "foiz", sahifa: 1, soni: 10 });
  });
  it("carries every filter under the URL's own names", () => {
    expect(rowsParams(f({ oy: "2026-09", kesim: "ustoz", q: " olim ", tartib: "qoldi", qarzdor: "1", sahifa: 3, soni: 30 }), "2026-10"))
      .toEqual({ oy: "2026-09", kesim: "ustoz", tartib: "qoldi", q: "olim", qarzdor: "1", sahifa: 3, soni: 30 });
  });
  it("junk falls back to the defaults the server accepts", () => {
    expect(rowsParams(f({ kesim: "sinf", tartib: "summa", qarzdor: "ha", sahifa: 0, soni: 15 }), "2026-10"))
      .toEqual({ kesim: "guruh", tartib: "foiz", sahifa: 1, soni: 10 });
  });
});

describe("excelParams", () => {
  it("the filters without the page", () => {
    expect(excelParams(f({ oy: "2026-09", qarzdor: "1", sahifa: 4 }), "2026-10")).toEqual({ oy: "2026-09", kesim: "guruh", tartib: "foiz", qarzdor: "1" });
  });
});

describe("hasGpFilter / excelFileName", () => {
  it("only the search and «Faqat qarzi borlar» are filters «Tozalash» clears", () => {
    expect(hasGpFilter(f())).toBe(false);
    expect(hasGpFilter(f({ kesim: "kurs", tartib: "nomi" }))).toBe(false);
    expect(hasGpFilter(f({ q: "a1" }))).toBe(true);
    expect(hasGpFilter(f({ qarzdor: "1" }))).toBe(true);
  });
  it("names the file by the month", () => expect(excelFileName("2026-10")).toBe("guruhlar-tolovi-2026-10.xlsx"));
});
