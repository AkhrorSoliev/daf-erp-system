import { addMonths } from "@/components/payments/salary-utils";

/** The page's period chips (spec B4 §3.3). */
export type PeriodId = "bugun" | "kecha" | "hafta" | "oy" | "otgan-oy" | "oraliq";
const PERIOD_IDS: readonly string[] = ["bugun", "kecha", "hafta", "oy", "otgan-oy", "oraliq"];

/** Nothing is reported before this day (the system's reporting floor). */
export const PAYMENTS_FLOOR_DAY = "2026-05-01";

export const PAYMENTS_LIST_SCHEMA = {
  davr: { type: "string", defaultValue: "oy" },
  dan: { type: "string", defaultValue: "" },
  gacha: { type: "string", defaultValue: "" },
  q: { type: "string", defaultValue: "" },
  usul: { type: "string", defaultValue: "" },
  nimaga: { type: "string", defaultValue: "" },
  guruh: { type: "string", defaultValue: "" },
  ustoz: { type: "string", defaultValue: "" },
  kurs: { type: "string", defaultValue: "" },
  qabul: { type: "string", defaultValue: "" },
  manba: { type: "string", defaultValue: "" },
  holat: { type: "string", defaultValue: "otgan" },
  sahifa: { type: "number", defaultValue: 1 },
  soni: { type: "number", defaultValue: 50 },
  tolov: { type: "string", defaultValue: "" },
} as const;

export interface PaymentFilters {
  davr: string; dan: string; gacha: string; q: string; usul: string; nimaga: string; guruh: string;
  ustoz: string; kurs: string; qabul: string; manba: string; holat: string; sahifa: number; soni: number; tolov: string;
}

type Range = { startDate: string; endDate: string };

const DAY_MS = 86_400_000;
const pad = (n: number) => String(n).padStart(2, "0");
const toStr = (ms: number) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};
const toMs = (day: string) => new Date(`${day}T00:00:00Z`).getTime();
/** A real calendar day: `2026-02-30` is not one (UTC arithmetic, no clock). */
const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && toStr(toMs(s)) === s;
const monthEnd = (monthKey: string) => {
  const [y, m] = monthKey.split("-").map(Number);
  return `${monthKey}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`;
};

export function cleanPeriodId(davr: string): PeriodId {
  return PERIOD_IDS.includes(davr) ? (davr as PeriodId) : "oy";
}

/** The period as Tashkent days; `null` is an unusable «Oraliq» (no request is sent). */
export function periodRange(davr: string, todayStr: string, dan = "", gacha = ""): Range | null {
  const month = todayStr.slice(0, 7);
  switch (cleanPeriodId(davr)) {
    case "bugun":
      return { startDate: todayStr, endDate: todayStr };
    case "kecha": {
      const y = toStr(toMs(todayStr) - DAY_MS);
      return { startDate: y, endDate: y };
    }
    case "hafta": {
      const sinceMonday = (new Date(toMs(todayStr)).getUTCDay() + 6) % 7;
      const monday = toMs(todayStr) - sinceMonday * DAY_MS;
      return { startDate: toStr(monday), endDate: toStr(monday + 6 * DAY_MS) };
    }
    case "otgan-oy": {
      const prev = addMonths(month, -1);
      return { startDate: `${prev}-01`, endDate: monthEnd(prev) };
    }
    case "oraliq": {
      if (!isDay(dan) || !isDay(gacha) || gacha < dan || gacha < PAYMENTS_FLOOR_DAY) return null;
      return { startDate: dan < PAYMENTS_FLOOR_DAY ? PAYMENTS_FLOOR_DAY : dan, endDate: gacha };
    }
    default:
      return { startDate: `${month}-01`, endDate: monthEnd(month) };
  }
}

export function periodParams(f: PaymentFilters, todayStr: string): Range | null {
  return periodRange(f.davr, todayStr, f.dan, f.gacha);
}

const PARTS: Record<string, string> = { joriy: "CURRENT", oldindan: "ADVANCE", qarz: "LATE" };
const SOURCES: Record<string, string> = { admin: "ADMIN", onlayn: "ONLINE" };
const STATUSES: Record<string, string> = { otgan: "COMPLETED", bekor: "REVERSED", hammasi: "ALL" };
/** Only the table's own keys: `?holat=constructor` must not pick a prototype member. */
const own = (table: Record<string, string>, key: string): string | undefined => (Object.hasOwn(table, key) ? table[key] : undefined);
const METHODS = ["CASH", "CLICK", "PAYME", "TRANSFER", "UZUM", "QR"];

const tokens = (s: string) => s.split(",").map((t) => t.trim()).filter(Boolean);
const digits = (s: string) => tokens(s).filter((t) => /^\d+$/.test(t));

/** The URL as the server's `GET /payments/list/rows` reads it; `null` = invalid «Oraliq». The branch never goes here (X-Branch-Id header). */
export function listParams(f: PaymentFilters, todayStr: string): Record<string, string | number> | null {
  const range = periodParams(f, todayStr);
  if (!range) return null;
  const out: Record<string, string | number> = { ...range };
  const put = (key: string, value: string | undefined) => {
    if (value) out[key] = value;
  };
  put("search", f.q.trim().slice(0, 100));
  put("method", tokens(f.usul).filter((m) => METHODS.includes(m)).join(","));
  put("part", own(PARTS, f.nimaga));
  put("groupId", tokens(f.guruh).join(","));
  put("teacherId", digits(f.ustoz).join(","));
  put("courseId", tokens(f.kurs).join(","));
  if (tokens(f.qabul).includes("onlayn")) out.online = "true";
  put("receivedById", digits(f.qabul).join(","));
  put("source", own(SOURCES, f.manba));
  out.status = own(STATUSES, f.holat) ?? "COMPLETED";
  out.page = Number.isInteger(f.sahifa) && f.sahifa >= 1 ? f.sahifa : 1;
  out.pageSize = f.soni === 100 ? 100 : 50;
  return out;
}

/** The filters inside «Yana filtrlar» that are set (the button's pill). */
export function moreFiltersCount(f: PaymentFilters): number {
  return [f.ustoz, f.kurs, f.qabul, f.manba].filter(Boolean).length + (f.holat === "bekor" || f.holat === "hammasi" ? 1 : 0);
}

/** Any filter set — the period, paging and the drawer are not filters. */
export function hasPaymentFilter(f: PaymentFilters): boolean {
  return Boolean(f.q.trim() || f.usul || f.nimaga || f.guruh) || moreFiltersCount(f) > 0;
}

/** «Umumiy ma'lumotlar» → the list for the page's month (spec B4 §6.3). */
export function paymentsListHref(month: string, currentMonth: string): string {
  if (month === currentMonth) return "/payments/list?davr=oy";
  if (month === addMonths(currentMonth, -1)) return "/payments/list?davr=otgan-oy";
  return `/payments/list?davr=oraliq&dan=${month}-01&gacha=${monthEnd(month)}`;
}

type SearchParams = Record<string, string | string[] | undefined>;
const firstOf = (v: string | string[] | undefined) => tokens([v].flat().join(","))[0] ?? "";

/** The old `/reports/student-payments?…` link as a `/payments/list` link (spec B4 §6.2). Branch and paging are dropped. */
export function legacyStudentPaymentsRedirect(sp: SearchParams): string {
  const start = firstOf(sp.startDate);
  const end = firstOf(sp.endDate);
  const q = new URLSearchParams();
  if (isDay(start) && isDay(end) && start <= end && end >= PAYMENTS_FLOOR_DAY) {
    q.set("davr", "oraliq");
    q.set("dan", start < PAYMENTS_FLOOR_DAY ? PAYMENTS_FLOOR_DAY : start);
    q.set("gacha", end);
  }
  for (const [key, from] of [["guruh", sp.groupIds], ["ustoz", sp.teacherIds], ["usul", sp.methods], ["kurs", sp.courseId]] as const) {
    const v = firstOf(from);
    if (v) q.set(key, v);
  }
  const qs = q.toString();
  return qs ? `/payments/list?${qs}` : "/payments/list";
}
