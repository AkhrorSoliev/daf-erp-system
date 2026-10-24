import { msg } from "@/i18n/msg";
import { interpolate } from "@/i18n/translate";
import { tashkentWallClock } from "@/lib/tashkent-time";
import type { Translate } from "@/components/notifications/notification-view";
import { cleanPreset } from "./departed-url";

const LOCATIVE = [
  msg("yanvarda"), msg("fevralda"), msg("martda"), msg("aprelda"), msg("mayda"), msg("iyunda"),
  msg("iyulda"), msg("avgustda"), msg("sentabrda"), msg("oktabrda"), msg("noyabrda"), msg("dekabrda"),
];

/** One decimal with a comma: 4.5 → «4,5». */
const oneDecimal = (v: number): string => v.toFixed(1).replace(".", ",");

/** «Har 100 o'quvchidan»: below 10 one decimal («4,5»), from 10 whole («12»); no data «—». */
export function formatPer100(v: number | null): string {
  if (v === null) return "—";
  // 9.96 prints as «10,0» with one decimal, so it is judged by what would be shown.
  return Math.round(v * 10) / 10 < 10 ? oneDecimal(v) : String(Math.round(v));
}

/** «3,4 oy»; no data «—». `t` is the page's (default: the Uzbek text). */
export function formatStudyMonths(v: number | null, t: Translate = interpolate): string {
  return v === null ? "—" : t("{n} oy", { n: oneDecimal(v) });
}

/** What the previous period is called under a card: «sentabrda», «oldingi 3 oyda»… */
export function previousLabel(preset: string, previous: { startDate: string }, t: Translate = interpolate): string {
  const p = cleanPreset(preset);
  if (p === "current_month" || p === "last_month") {
    const month = LOCATIVE[Number(previous.startDate.slice(5, 7)) - 1];
    return month ? t(month) : t("oldingi davrda");
  }
  if (p === "3m") return t("oldingi 3 oyda");
  if (p === "6m") return t("oldingi 6 oyda");
  return t("oldingi davrda");
}

/** dd.MM.yyyy of the Tashkent day an instant falls on. */
export function formatDay(iso: string): string {
  const t = tashkentWallClock(iso);
  const dd = String(t.getUTCDate()).padStart(2, "0");
  const mm = String(t.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${t.getUTCFullYear()}`;
}

/** «2026-09» → «sentabrda» (the bot report's card title); an unreadable key comes back as it is. */
export const monthLocative = (key: string, t: Translate = interpolate): string => {
  const name = LOCATIVE[Number(key.slice(5, 7)) - 1];
  return name ? t(name) : key;
};

/** What the chosen period is called: its month («sentabrda») only when it is that whole month (1st to last day), else «shu davrda». */
export function rangeLabel(range: { startDate: string; endDate: string }, t: Translate = interpolate): string {
  if (range.startDate.slice(0, 7) !== range.endDate.slice(0, 7)) return t("shu davrda");
  const year = Number(range.startDate.slice(0, 4));
  const month = Number(range.startDate.slice(5, 7));
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (range.startDate.slice(8, 10) !== "01" || Number(range.endDate.slice(8, 10)) !== lastDay) return t("shu davrda");
  const name = LOCATIVE[month - 1];
  return name ? t(name) : t("shu davrda");
}

export const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

// The shared month keys (`chart-months.ts`, `salary-utils.ts`); short June/July use the full names.
const MONTH_SHORT = [msg("Yan"), msg("Fev"), msg("Mar"), msg("Apr"), msg("May"), msg("Iyun"), msg("Iyul"), msg("Avg"), msg("Sen"), msg("Okt"), msg("Noy"), msg("Dek")];
const MONTH_FULL = [msg("Yanvar"), msg("Fevral"), msg("Mart"), msg("Aprel"), msg("May"), msg("Iyun"), msg("Iyul"), msg("Avgust"), msg("Sentabr"), msg("Oktabr"), msg("Noyabr"), msg("Dekabr")];

/** Without `t` the Uzbek name in lower case (as before); with the page's `t` its translation. */
const monthName = (list: string[], key: string, t?: (source: string) => string): string => {
  const name = list[Number(key.slice(5, 7)) - 1];
  if (name === undefined) return key;
  return t ? t(name) : name.toLowerCase();
};

/** «2026-09» → «sen». */
export const monthShort = (key: string, t?: (source: string) => string): string => monthName(MONTH_SHORT, key, t);

/** «2026-09» → «sentabr». */
export const monthFull = (key: string, t?: (source: string) => string): string => monthName(MONTH_FULL, key, t);

/** «17,5%», «4%»; no share (too few students at the start) «—». */
export function formatShare(share: number | null): string {
  return share === null ? "—" : `${String(share).replace(".", ",")}%`;
}
