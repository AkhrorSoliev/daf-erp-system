import { describe, expect, it } from "vitest";
import {
  DEPARTED_CLEARED,
  DEPARTED_SCHEMA,
  cleanCut,
  cleanPreset,
  departedExcelFileName,
  departedExcelParams,
  departedParams,
  hasDepartedFilter,
  isoDay,
  listParams,
  parseDay,
  resolveDepartedRange,
  type DepartedFilters,
} from "./departed-url";

const TODAY = new Date(2026, 9, 17); // 2026-10-17
const DEFAULTS = Object.fromEntries(
  Object.entries(DEPARTED_SCHEMA).map(([k, v]) => [k, v.defaultValue]),
) as unknown as DepartedFilters;
const f = (u: Partial<DepartedFilters> = {}): DepartedFilters => ({ ...DEFAULTS, ...u });

describe("DEPARTED_SCHEMA", () => {
  it("defaults: this month, teacher cut, page 1 of 10, nothing else", () => {
    expect(DEFAULTS).toEqual({
      preset: "current_month",
      startDate: "",
      endDate: "",
      courseId: [],
      teacherIds: [],
      cut: "teacher",
      q: "",
      reason: "",
      state: "",
      debtors: "",
      page: 1,
      pageSize: 10,
    });
  });
  it("course and teacher lists are comma lists in the URL", () => {
    expect(DEPARTED_SCHEMA.courseId.type).toBe("array");
    expect(DEPARTED_SCHEMA.teacherIds.type).toBe("array");
  });
});

describe("resolveDepartedRange", () => {
  it("current_month runs to the month's last day, future days included", () => {
    expect(resolveDepartedRange("current_month", "", "", TODAY)).toEqual({ startDate: "2026-10-01", endDate: "2026-10-31" });
  });
  it("last_month is the whole month before", () => {
    expect(resolveDepartedRange("last_month", "", "", TODAY)).toEqual({ startDate: "2026-09-01", endDate: "2026-09-30" });
  });
  it("3m is this month and the two before it", () => {
    expect(resolveDepartedRange("3m", "", "", TODAY)).toEqual({ startDate: "2026-08-01", endDate: "2026-10-31" });
  });
  it("6m is this month and the five before it, across the year end", () => {
    expect(resolveDepartedRange("6m", "", "", TODAY)).toEqual({ startDate: "2026-05-01", endDate: "2026-10-31" });
    expect(resolveDepartedRange("6m", "", "", new Date(2026, 1, 3))).toEqual({ startDate: "2025-09-01", endDate: "2026-02-28" });
  });
  it("last_month in January is December of the year before", () => {
    expect(resolveDepartedRange("last_month", "", "", new Date(2026, 0, 5))).toEqual({ startDate: "2025-12-01", endDate: "2025-12-31" });
  });
  it("range takes the picked days", () => {
    expect(resolveDepartedRange("range", "2026-08-10", "2026-09-05", TODAY)).toEqual({ startDate: "2026-08-10", endDate: "2026-09-05" });
  });
  it("range with a missing or unreadable day falls back to this month; reversed days are put in order", () => {
    expect(resolveDepartedRange("range", "", "2026-09-05", TODAY)).toEqual({ startDate: "2026-10-01", endDate: "2026-10-31" });
    expect(resolveDepartedRange("range", "2026-02-31", "2026-09-05", TODAY)).toEqual({ startDate: "2026-10-01", endDate: "2026-10-31" });
    expect(resolveDepartedRange("range", "2026-09-05", "2026-08-10", TODAY)).toEqual({ startDate: "2026-08-10", endDate: "2026-09-05" });
  });
  it("an old 12m link counts as 6m; an unknown preset as this month", () => {
    expect(resolveDepartedRange("12m", "", "", TODAY)).toEqual(resolveDepartedRange("6m", "", "", TODAY));
    expect(resolveDepartedRange("yil", "", "", TODAY)).toEqual(resolveDepartedRange("current_month", "", "", TODAY));
  });
});

describe("cleanPreset", () => {
  it("12m becomes 6m, junk becomes the default, known presets stay", () => {
    expect(cleanPreset("12m")).toBe("6m");
    expect(cleanPreset("")).toBe("current_month");
    expect(cleanPreset("range")).toBe("range");
    expect(cleanPreset("3m")).toBe("3m");
  });
});

describe("isoDay / parseDay", () => {
  it("round-trips a local calendar day", () => {
    expect(isoDay(new Date(2026, 0, 9))).toBe("2026-01-09");
    expect(parseDay("2026-01-09")?.getDate()).toBe(9);
    expect(parseDay("2026-13-01")).toBeNull();
    expect(parseDay("")).toBeNull();
  });
});

describe("departedParams / listParams", () => {
  it("overview params: the resolved days, lists comma-joined, nothing empty", () => {
    expect(departedParams(f(), TODAY)).toEqual({ startDate: "2026-10-01", endDate: "2026-10-31" });
    expect(departedParams(f({ preset: "3m", courseId: ["c1", "c2"], teacherIds: ["7", "9"] }), TODAY)).toEqual({
      startDate: "2026-08-01",
      endDate: "2026-10-31",
      courseId: "c1,c2",
      teacherIds: "7,9",
    });
  });
  it("list params add the search, reason, state, debtors and the page", () => {
    expect(listParams(f(), TODAY)).toEqual({ startDate: "2026-10-01", endDate: "2026-10-31", page: 1, pageSize: 10 });
    expect(listParams(f({ q: " vali ", reason: "none", state: "qaytgan", debtors: "1", page: 3, pageSize: 20 }), TODAY)).toEqual({
      startDate: "2026-10-01",
      endDate: "2026-10-31",
      q: "vali",
      reasonId: "none",
      state: "qaytgan",
      debtorsOnly: true,
      page: 3,
      pageSize: 20,
    });
  });
  it("junk state and page sizes fall back to what the server accepts", () => {
    expect(listParams(f({ state: "x", page: 0, pageSize: 5 }), TODAY)).toEqual({ startDate: "2026-10-01", endDate: "2026-10-31", page: 1, pageSize: 10 });
    expect(listParams(f({ pageSize: 99 }), TODAY).pageSize).toBe(10);
    expect(listParams(f({ pageSize: 50 }), TODAY).pageSize).toBe(50);
  });
});

describe("hasDepartedFilter / DEPARTED_CLEARED", () => {
  it("the default is no filter; a period, course or teacher is one", () => {
    expect(hasDepartedFilter(f())).toBe(false);
    expect(hasDepartedFilter(f({ cut: "course", q: "a" }))).toBe(false);
    expect(hasDepartedFilter(f({ preset: "6m" }))).toBe(true);
    expect(hasDepartedFilter(f({ courseId: ["c1"] }))).toBe(true);
    expect(hasDepartedFilter(f({ teacherIds: ["3"] }))).toBe(true);
  });
  it("«Tozalash» puts the period back and empties the course and teacher lists", () => {
    expect(DEPARTED_CLEARED).toEqual({ preset: "current_month", startDate: "", endDate: "", courseId: [], teacherIds: [] });
  });
});

describe("cleanCut", () => {
  it("the four cuts pass, anything else is the teacher cut", () => {
    for (const c of ["teacher", "course", "group", "branch"]) expect(cleanCut(c)).toBe(c);
    expect(cleanCut("x")).toBe("teacher");
    expect(cleanCut("")).toBe("teacher");
  });
});

describe("departedExcelParams / departedExcelFileName", () => {
  it("the list filters without the page", () => {
    expect(departedExcelParams(f({ q: " ali ", reason: "none", state: "qaytgan", debtors: "1", courseId: ["c1"], page: 3, pageSize: 50 }), TODAY)).toEqual({
      startDate: "2026-10-01", endDate: "2026-10-31", courseId: "c1", q: "ali", reasonId: "none", state: "qaytgan", debtorsOnly: true,
    });
  });
  it("the file is named after the period", () => {
    expect(departedExcelFileName({ startDate: "2026-10-01", endDate: "2026-10-31" })).toBe("ketgan-oquvchilar-2026-10-01_2026-10-31.xlsx");
  });
});
