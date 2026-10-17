import { clampMonth } from "@/components/payments/overview/overview-math";
import { addMonths } from "@/components/payments/salary-utils";
import { formatNumber, formatPrice } from "@/lib/format-utils";
import { tashkentDdMm, tashkentWallClock } from "@/lib/tashkent-time";
import type { KpiResultType, KpiRule, KpiSettings, KpiSettingsPatch } from "./kpi-types";

/** The KPI pages start with the results (spec §7.1/9). */
export const KPI_FIRST_MONTH = "2026-10";
/** The compare month may be the one before: October compares with an empty September. */
export const COMPARE_FLOOR_MONTH = "2026-09";
export const KPI_MAX_SOM = 10_000_000;
/** Results are written from this day (server KPI_START); a month that began earlier was recorded only in part. */
export const KPI_START_DAY = "17.10";

/** `?oy=` inside [2026-10, the current month]; empty or unreadable = the current month. */
export function kpiMonth(oy: string, current: string): string {
  return clampMonth(oy || current, KPI_FIRST_MONTH, current);
}

/** `?bilan=` inside [2026-09, the month before the page's month]; empty or unreadable = that month before. */
export function kpiCompare(bilan: string, month: string): string {
  const before = addMonths(month, -1);
  return bilan ? clampMonth(bilan, COMPARE_FLOOR_MONTH, before) : before;
}

export type DeltaUnit = "count" | "som" | "pct";

/** «▲ 2», «▼ 20 000 so'm», «▲ 5 foiz punkt», or «o'zgarmadi». */
export function deltaLine(value: number, compare: number, unit: DeltaUnit): string {
  if (value === compare) return "o'zgarmadi";
  const diff = Math.abs(value - compare);
  const text =
    unit === "som"
      ? `${formatPrice(diff)} so'm`
      : unit === "pct"
        ? `${formatNumber(diff)} foiz punkt`
        : formatNumber(diff);
  return `${value > compare ? "▲" : "▼"} ${text}`;
}

/**
 * `deltaLine`, or null when there is nothing honest to compare: the server says
 * the compare month has no KPI data (`compareAvailable` false) or a figure is missing.
 */
export function deltaOrNull(
  value: number | null,
  compare: number | null,
  unit: DeltaUnit,
  compareAvailable: boolean,
): string | null {
  if (!compareAvailable || value === null || compare === null) return null;
  return deltaLine(value, compare, unit);
}

/** A compare figure with its unit: «5», «20 000 so'm», «55%». */
export function compareText(compare: number, unit: DeltaUnit): string {
  if (unit === "som") return `${formatPrice(compare)} so'm`;
  return unit === "pct" ? `${formatNumber(compare)}%` : formatNumber(compare);
}

/** Green when better: more is better unless `higherIsBetter` is false (returned leads). */
export function deltaTone(value: number, compare: number, higherIsBetter = true): "good" | "bad" | "flat" {
  if (value === compare) return "flat";
  return value > compare === higherIsBetter ? "good" : "bad";
}

/** «50% (1 / 2)», or «—» when there is nothing to divide. */
export function ratioText(pct: number | null, part: number, whole: number): string {
  return pct === null ? "—" : `${formatNumber(pct)}% (${formatNumber(part)} / ${formatNumber(whole)})`;
}

/** «KPI hisoblash o'chiq (20.10 dan)» (spec §7.4). */
export function switchText(s: { enabled: boolean; changedAt: string | null }): string {
  const since = s.changedAt ? ` (${tashkentDdMm(s.changedAt)} dan)` : "";
  return `KPI hisoblash ${s.enabled ? "yoqilgan" : "o'chiq"}${since}`;
}

export const RESULT_TYPE_LABEL: Record<KpiResultType, string> = {
  LEAD_PAID: "Lid to'lov qildi",
  PROMISE_KEPT: "Va'da bajarildi",
};

/** dd.MM.yyyy on the Tashkent clock. */
export function dayText(iso: string): string {
  return `${tashkentDdMm(iso)}.${tashkentWallClock(iso).getUTCFullYear()}`;
}

/** The settings form's check; the server checks again. */
export function ruleError(rule: KpiRule): string | null {
  if (!Number.isInteger(rule.value)) return "Butun son kiriting";
  if (rule.value < 0) return "Manfiy bo'lishi mumkin emas";
  if (rule.mode === "PERCENT" && rule.value > 100) return "Foiz 0 dan 100 gacha bo'ladi";
  if (rule.mode === "FIXED" && rule.value > KPI_MAX_SOM) return "Summa 10 000 000 so'mdan oshmasin";
  return null;
}

/** Only what changed: the switch's time is the flip, so it is never re-sent. */
export function settingsPatch(saved: KpiSettings, draft: KpiSettings): KpiSettingsPatch {
  const patch: KpiSettingsPatch = {};
  if (draft.enabled !== saved.enabled) patch.enabled = draft.enabled;
  for (const key of ["leadPaid", "promiseKept"] as const) {
    if (draft[key].mode !== saved[key].mode || draft[key].value !== saved[key].value) {
      patch[key] = draft[key];
    }
  }
  return patch;
}

/** The metric definitions of spec §7.7, printed under the table. */
export const KPI_DEFINITIONS = [
  {
    term: "Lid → to'lov",
    text: "oyda xodimga kelgan lidlar (o'zi band qilgan yoki unga berilgan, har lid bir marta) dan nechtasida uning «Lid to'lov qildi» natijasi bor. Joriy oyda hali to'lamaganlar ham hisobda.",
  },
  {
    term: "Va'da bajarilishi",
    text: "xodim yozgan, va'da kuni shu oyga tushgan va'dalardan bajarilganlari: bajarilgan / (bajarilgan + buzilgan). Ochiq va'da kirmaydi.",
  },
  {
    term: "Qaytgan lidlar",
    text: "shu oyda muddati o'tib xodimdan umumiy ro'yxatga qaytgan lidlar.",
  },
  {
    term: "Taqqoslash",
    text: "joriy oy taqqoslanayotgan oyning shu kunigacha bo'lgan qismi bilan solishtiriladi.",
  },
] as const;

/** Y-axis tick for sums: 1 200 000 → «1,2 mln», smaller ones in full. */
/** The line under «Administratorlar»: converted leads nobody had claimed (CEO, 17.10.2026). */
export function unownedConversionsText(n: number): string {
  if (n === 0) return "Egasiz o'quvchiga aylangan lid yo'q — hamma lid band qilinib ishlangan.";
  return `Egasiz o'quvchiga aylangan lidlar: ${n} ta — ularni hech kim band qilmagan, natija hech kimga yozilmadi.`;
}

export function axisSom(v: number): string {
  return v >= 1_000_000 ? `${formatNumber(v / 1_000_000, { maximumFractionDigits: 1 })} mln` : formatPrice(v);
}

const ADMINISTRATOR_ROLE_ID = 3;

export function isKpiAdministrator(roles: { id: number }[] | undefined): boolean {
  return roles?.some((r) => r.id === ADMINISTRATOR_ROLE_ID) ?? false;
}

/**
 * The employee page's «KPI» tab (spec §7.8), for a viewer with `kpi.view`: a current Administrator,
 * or anyone with a KPI result in the viewer's scope (`hasResults` = the server's `hasAny`).
 */
export function showKpiTab(roles: { id: number }[] | undefined, canView: boolean, hasResults = false): boolean {
  return canView && (isKpiAdministrator(roles) || hasResults);
}
