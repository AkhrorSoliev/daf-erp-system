import type { CutKey, ListState } from "./departed-types";

export const DEPARTED_PAGE_SIZES = [10, 20, 30, 40, 50];

/** URL keys; defaults are left out of the URL by `useUrlFilters`. Course and teacher lists are comma lists. */
export const DEPARTED_SCHEMA = {
  preset: { type: "string", defaultValue: "current_month" },
  startDate: { type: "string", defaultValue: "" },
  endDate: { type: "string", defaultValue: "" },
  courseId: { type: "array", defaultValue: [] },
  teacherIds: { type: "array", defaultValue: [] },
  cut: { type: "string", defaultValue: "teacher" },
  q: { type: "string", defaultValue: "" },
  reason: { type: "string", defaultValue: "" },
  state: { type: "string", defaultValue: "" },
  debtors: { type: "string", defaultValue: "" },
  page: { type: "number", defaultValue: 1 },
  pageSize: { type: "number", defaultValue: 10 },
} as const;

export interface DepartedFilters {
  preset: string;
  startDate: string;
  endDate: string;
  courseId: string[];
  teacherIds: string[];
  cut: string;
  q: string;
  reason: string;
  state: string;
  debtors: string;
  page: number;
  pageSize: number;
}

/** «Tozalash»: the period back to this month, no course or teacher; the search, cut and list filters stay. The page puts the list on page 1. */
export const DEPARTED_CLEARED: Partial<DepartedFilters> = {
  preset: "current_month",
  startDate: "",
  endDate: "",
  courseId: [],
  teacherIds: [],
};

const PRESETS: readonly string[] = ["current_month", "last_month", "3m", "6m", "range"];
const STATES: readonly string[] = ["ketgan", "kutilmoqda", "qaytgan"];

/** An old `12m` link counts as `6m`; anything unknown as this month. */
export function cleanPreset(v: string): string {
  if (v === "12m") return "6m";
  return PRESETS.includes(v) ? v : "current_month";
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** A local calendar day as YYYY-MM-DD (what a `<DatePicker>` hands over). */
export const isoDay = (d: Date): string => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/** YYYY-MM-DD as a local date; null for anything that is not a real calendar day. */
export function parseDay(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isoDay(d) === s ? d : null;
}

/** First day of the month `back` months before `today`'s, and the last day of the month `today` is in. */
const monthStart = (today: Date, back: number) => new Date(today.getFullYear(), today.getMonth() - back, 1);
const monthEnd = (today: Date, back: number) => new Date(today.getFullYear(), today.getMonth() - back + 1, 0);

/**
 * The days a preset stands for. `today` is read by its local calendar fields —
 * the caller passes the Tashkent day. The current month runs to its LAST day,
 * future days included; `3m` / `6m` are this month plus the 2 / 5 before it.
 */
export function resolveDepartedRange(preset: string, startDate: string, endDate: string, today: Date): { startDate: string; endDate: string } {
  const p = cleanPreset(preset);
  const month = (from: number, to: number) => ({ startDate: isoDay(monthStart(today, from)), endDate: isoDay(monthEnd(today, to)) });
  if (p === "range") {
    const a = parseDay(startDate);
    const b = parseDay(endDate);
    if (!a || !b) return month(0, 0);
    return a <= b ? { startDate: isoDay(a), endDate: isoDay(b) } : { startDate: isoDay(b), endDate: isoDay(a) };
  }
  if (p === "last_month") return month(1, 1);
  if (p === "3m") return month(2, 0);
  if (p === "6m") return month(5, 0);
  return month(0, 0);
}

/** The filters as `GET /reports/departed-students/overview` reads them. */
export function departedParams(f: DepartedFilters, today: Date): Record<string, string> {
  const out: Record<string, string> = { ...resolveDepartedRange(f.preset, f.startDate, f.endDate, today) };
  if (f.courseId.length) out.courseId = f.courseId.join(",");
  if (f.teacherIds.length) out.teacherIds = f.teacherIds.join(",");
  return out;
}

/** …plus the search, reason, state, debt switch and page, for `GET /reports/departed-students/list`. */
export function listParams(f: DepartedFilters, today: Date): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = { ...departedParams(f, today) };
  const q = f.q.trim().slice(0, 100);
  if (q) out.q = q;
  if (f.reason) out.reasonId = f.reason;
  if (STATES.includes(f.state)) out.state = f.state as ListState;
  if (f.debtors === "1") out.debtorsOnly = true;
  out.page = Number.isInteger(f.page) && f.page >= 1 ? f.page : 1;
  out.pageSize = DEPARTED_PAGE_SIZES.includes(f.pageSize) ? f.pageSize : 10;
  return out;
}

export const hasDepartedFilter = (f: DepartedFilters): boolean =>
  cleanPreset(f.preset) !== "current_month" || f.courseId.length > 0 || f.teacherIds.length > 0;

const CUTS: readonly string[] = ["teacher", "course", "group", "branch"];

/** An unknown `?cut=` is the teacher cut. */
export const cleanCut = (v: string): CutKey => (CUTS.includes(v) ? (v as CutKey) : "teacher");

/** The list's filters without the page, for `GET /reports/departed-students/excel`. */
export function departedExcelParams(f: DepartedFilters, today: Date): Record<string, string | number | boolean> {
  const out = listParams(f, today);
  delete out.page;
  delete out.pageSize;
  return out;
}

export const departedExcelFileName = (range: { startDate: string; endDate: string }): string =>
  `ketgan-oquvchilar-${range.startDate}_${range.endDate}.xlsx`;
