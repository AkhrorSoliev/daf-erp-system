import { describe, expect, it } from "vitest";
import { readFilters } from "@/lib/url-filter-params";
import {
  ATTENDANCE_SCHEMA, attendanceRange, excelFileName, keepMissersFor, missersParams, overviewParams, type AttendanceFilters,
} from "./attendance-url";

const TODAY = new Date(2026, 9, 17); // 17.10.2026, the Tashkent day as a local date
const read = (qs: string) => readFilters(ATTENDANCE_SCHEMA, new URLSearchParams(qs)) as unknown as AttendanceFilters;

describe("attendance-url", () => {
  it("defaults: this month, the group cut, page 1 of 10", () => {
    expect(overviewParams(read(""), TODAY)).toEqual({ startDate: "2026-10-01", endDate: "2026-10-31", cut: "group", page: 1, pageSize: 10 });
  });

  it("old att_* keys and junk values fall back to the defaults — never an error screen", () => {
    expect(overviewParams(read("att_tab=teachers&att_branchId=3&cut=foo&page=-2&pageSize=7&preset=xyz"), TODAY)).toEqual({
      startDate: "2026-10-01", endDate: "2026-10-31", cut: "group", page: 1, pageSize: 10,
    });
  });

  it("the period buttons are 7a's", () => {
    expect(attendanceRange(read("preset=last_month"), TODAY)).toEqual({ startDate: "2026-09-01", endDate: "2026-09-30" });
    expect(attendanceRange(read("preset=6m"), TODAY)).toEqual({ startDate: "2026-05-01", endDate: "2026-10-31" });
    expect(overviewParams(read("cut=teacher&page=3&pageSize=50"), TODAY)).toMatchObject({ cut: "teacher", page: 3, pageSize: 50 });
  });

  it("never asks before 2026-05-01 (the server's floor answers 400)", () => {
    expect(attendanceRange(read("preset=range&startDate=2026-04-01&endDate=2026-06-30"), TODAY)).toEqual({ startDate: "2026-05-01", endDate: "2026-06-30" });
    expect(attendanceRange(read("preset=3m"), new Date(2026, 5, 10))).toEqual({ startDate: "2026-05-01", endDate: "2026-06-30" });
    // a period wholly before the floor becomes this month
    expect(attendanceRange(read("preset=last_month"), new Date(2026, 4, 10))).toEqual({ startDate: "2026-05-01", endDate: "2026-05-31" });
  });

  it("the month rollover changes the days, so the query key", () => {
    expect(attendanceRange(read(""), new Date(2026, 10, 1))).toEqual({ startDate: "2026-11-01", endDate: "2026-11-30" });
  });

  it("missersParams and the file name", () => {
    expect(missersParams({ startDate: "2026-09-01", endDate: "2026-09-30" }, "teacher", "none", 0, 99)).toEqual({
      startDate: "2026-09-01", endDate: "2026-09-30", cut: "teacher", key: "none", page: 1, pageSize: 10,
    });
    expect(excelFileName({ startDate: "2026-09-01", endDate: "2026-09-30" })).toBe("davomat-2026-09-01_2026-09-30.xlsx");
  });

  it("the missers list keeps the old answer only for the same row of the same cut", () => {
    const a = missersParams({ startDate: "2026-09-01", endDate: "2026-09-30" }, "group", "g1", 1, 10);
    expect(keepMissersFor(a, { ...a, page: 2 })).toBe(true);
    expect(keepMissersFor(a, { ...a, key: "g2" })).toBe(false);
    expect(keepMissersFor(a, { ...a, cut: "teacher" })).toBe(false);
    expect(keepMissersFor(null, a)).toBe(false);
    expect(keepMissersFor(a, null)).toBe(false);
  });
});
