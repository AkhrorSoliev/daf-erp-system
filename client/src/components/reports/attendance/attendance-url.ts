import { resolveDepartedRange } from "@/components/reports/departed-students/departed-url";
import type { CutKey } from "./attendance-types";

/** The report starts with the reporting base (spec B7c §3); the server answers 400 before it. */
export const ATT_FLOOR = "2026-05-01";
export const ATT_PAGE_SIZES = [10, 20, 30, 40, 50];

/** URL keys; defaults are left out of the URL by `useUrlFilters`. The old `att_*` keys are not read. */
export const ATTENDANCE_SCHEMA = {
  preset: { type: "string", defaultValue: "current_month" },
  startDate: { type: "string", defaultValue: "" },
  endDate: { type: "string", defaultValue: "" },
  cut: { type: "string", defaultValue: "group" },
  page: { type: "number", defaultValue: 1 },
  pageSize: { type: "number", defaultValue: 10 },
} as const;

export interface AttendanceFilters {
  preset: string;
  startDate: string;
  endDate: string;
  cut: string;
  page: number;
  pageSize: number;
}

/** «Qayta urinish» on an error with a non-default URL goes back here. */
export const ATTENDANCE_DEFAULTS: AttendanceFilters = {
  preset: "current_month", startDate: "", endDate: "", cut: "group", page: 1, pageSize: 10,
};

const CUTS: readonly string[] = ["group", "teacher", "course"];

/** An unknown `?cut=` is the group cut. */
export const cleanCut = (v: string): CutKey => (CUTS.includes(v) ? (v as CutKey) : "group");

export interface DayRange {
  startDate: string;
  endDate: string;
}

/**
 * The days a preset stands for (7a's buttons), never before 2026-05-01: a start
 * before it is lifted to it, a period wholly before it becomes this month.
 * `today` is the Tashkent day as a local date.
 */
export function attendanceRange(f: Pick<AttendanceFilters, "preset" | "startDate" | "endDate">, today: Date): DayRange {
  const r = resolveDepartedRange(f.preset, f.startDate, f.endDate, today);
  if (r.endDate < ATT_FLOOR) return resolveDepartedRange("current_month", "", "", today);
  return r.startDate < ATT_FLOOR ? { startDate: ATT_FLOOR, endDate: r.endDate } : r;
}

const cleanPage = (n: number): number => (Number.isInteger(n) && n >= 1 ? n : 1);
const cleanSize = (n: number): number => (ATT_PAGE_SIZES.includes(n) ? n : 10);

export interface OverviewParams extends DayRange {
  cut: CutKey;
  page: number;
  pageSize: number;
}

/** The filters as `GET /reports/attendance-stats/overview` reads them. */
export function overviewParams(f: AttendanceFilters, today: Date): OverviewParams {
  return { ...attendanceRange(f, today), cut: cleanCut(f.cut), page: cleanPage(f.page), pageSize: cleanSize(f.pageSize) };
}

export interface MissersParams extends OverviewParams {
  key: string;
}

/** One cut row's «ko'p qoldiruvchi» page, for `GET /reports/attendance-stats/missers`. */
export function missersParams(range: DayRange, cut: CutKey, key: string, page: number, pageSize: number): MissersParams {
  return { ...range, cut, key, page: cleanPage(page), pageSize: cleanSize(pageSize) };
}

export const excelFileName = (r: DayRange): string => `davomat-${r.startDate}_${r.endDate}.xlsx`;

/** The earlier missers answer may stand in only for the same row of the same cut (another page); another row never shows this one's students. */
export const keepMissersFor = (prev: MissersParams | null, next: MissersParams | null): boolean =>
  prev !== null && next !== null && prev.key === next.key && prev.cut === next.cut;
