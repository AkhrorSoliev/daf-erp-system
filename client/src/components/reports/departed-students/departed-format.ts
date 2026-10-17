import { tashkentWallClock } from "@/lib/tashkent-time";
import { cleanPreset } from "./departed-url";
import type { ListState } from "./departed-types";

export const STATE_LABEL: Record<ListState, string> = {
  ketgan: "Ketgan",
  kutilmoqda: "Kutilmoqda",
  qaytgan: "Qaytgan",
};

const LOCATIVE = [
  "yanvarda", "fevralda", "martda", "aprelda", "mayda", "iyunda",
  "iyulda", "avgustda", "sentabrda", "oktabrda", "noyabrda", "dekabrda",
];

/** One decimal with a comma: 4.5 → «4,5». */
const oneDecimal = (v: number): string => v.toFixed(1).replace(".", ",");

/** «Har 100 o'quvchidan»: below 10 one decimal («4,5»), from 10 whole («12»); no data «—». */
export function formatPer100(v: number | null): string {
  if (v === null) return "—";
  // 9.96 prints as «10,0» with one decimal, so it is judged by what would be shown.
  return Math.round(v * 10) / 10 < 10 ? oneDecimal(v) : String(Math.round(v));
}

/** «3,4 oy»; no data «—». */
export function formatStudyMonths(v: number | null): string {
  return v === null ? "—" : `${oneDecimal(v)} oy`;
}

/** What the previous period is called under a card: «sentabrda», «oldingi 3 oyda»… */
export function previousLabel(preset: string, previous: { startDate: string }): string {
  const p = cleanPreset(preset);
  if (p === "current_month" || p === "last_month") {
    return LOCATIVE[Number(previous.startDate.slice(5, 7)) - 1] ?? "oldingi davrda";
  }
  if (p === "3m") return "oldingi 3 oyda";
  if (p === "6m") return "oldingi 6 oyda";
  return "oldingi davrda";
}

/** dd.MM.yyyy of the Tashkent day an instant falls on. */
export function formatDay(iso: string): string {
  const t = tashkentWallClock(iso);
  const dd = String(t.getUTCDate()).padStart(2, "0");
  const mm = String(t.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${t.getUTCFullYear()}`;
}

/** What the chosen period is called: its month («sentabrda») only when it is that whole month (1st to last day), else «shu davrda». */
export function rangeLabel(range: { startDate: string; endDate: string }): string {
  if (range.startDate.slice(0, 7) !== range.endDate.slice(0, 7)) return "shu davrda";
  const year = Number(range.startDate.slice(0, 4));
  const month = Number(range.startDate.slice(5, 7));
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (range.startDate.slice(8, 10) !== "01" || Number(range.endDate.slice(8, 10)) !== lastDay) return "shu davrda";
  return LOCATIVE[month - 1] ?? "shu davrda";
}

export const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

const MONTH_SHORT = ["yan", "fev", "mar", "apr", "may", "iyun", "iyul", "avg", "sen", "okt", "noy", "dek"];
const MONTH_FULL = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];

/** «2026-09» → «sen». */
export const monthShort = (key: string): string => MONTH_SHORT[Number(key.slice(5, 7)) - 1] ?? key;

/** «2026-09» → «sentabr». */
export const monthFull = (key: string): string => MONTH_FULL[Number(key.slice(5, 7)) - 1] ?? key;

/** «17,5%», «4%»; no share (too few students at the start) «—». */
export function formatShare(share: number | null): string {
  return share === null ? "—" : `${String(share).replace(".", ",")}%`;
}
