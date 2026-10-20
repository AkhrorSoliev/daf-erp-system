import { msg } from "@/i18n/msg";
import { interpolate } from "@/i18n/translate";
import { formatNumber } from "@/lib/format-utils";
import type { Translate } from "@/components/notifications/notification-view";
import { capitalize, monthFull, previousLabel } from "@/components/reports/departed-students/departed-format";
import { mlnText } from "@/components/reports/center-activity/center-activity-format";
import type { CreditResult, CutKey } from "./attendance-types";

/** The page's month translator: lower case in uz/ru, capitalised in de/en. Without it the Uzbek name in lower case. */
type MonthT = (source: string) => string;

/** «81%»: the server's one-decimal rate shown whole; «—» when there was nothing to divide by. */
export const pctText = (n: number | null): string => (n === null ? "—" : `${Math.round(n)}%`);

export type Tone = "good" | "warn" | "bad" | "none";

/** Below 80% yellow, below 75% red (spec §4), on the server's one-decimal figure. */
export function rateTone(n: number | null): Tone {
  if (n === null) return "none";
  if (n < 75) return "bad";
  if (n < 80) return "warn";
  return "good";
}

export const TONE_BAR: Record<Tone, string> = {
  good: "bg-success",
  warn: "bg-warning",
  bad: "bg-destructive",
  none: "bg-muted",
};

/** «sentabr 81%», and «(oy tugamagan)» for a month that has not ended — the spoken text of a month bar. */
export const monthSpoken = (
  m: { month: string; rate: number | null; partial: boolean },
  t: Translate = interpolate,
  monthT?: MonthT,
): string => `${monthFull(m.month, monthT)} ${pctText(m.rate)}${m.partial ? ` ${t("(oy tugamagan)")}` : ""}`;

const WEEKDAY = [msg("Dushanba"), msg("Seshanba"), msg("Chorshanba"), msg("Payshanba"), msg("Juma"), msg("Shanba"), msg("Yakshanba")];

/** 1 = dushanba … 7 = yakshanba, the full name. */
export const weekdayName = (day: number, t: Translate = interpolate): string => {
  const name = WEEKDAY[day - 1];
  return name === undefined ? "" : t(name);
};

export const CUT_LABEL: Record<CutKey, string> = { group: msg("Guruhlar"), teacher: msg("Ustozlar"), course: msg("Kurslar") };
export const CUT_COLUMN: Record<CutKey, string> = { group: msg("Guruh"), teacher: msg("Ustoz"), course: msg("Kurs") };
/** The table's heading: one whole text per cut, never a lower-cased label glued in. */
export const CUT_TITLE: Record<CutKey, string> = {
  group: msg("Davomati past guruhlar"),
  teacher: msg("Davomati past ustozlar"),
  course: msg("Davomati past kurslar"),
};

function isWholeMonth(r: { startDate: string; endDate: string }): boolean {
  if (r.startDate.slice(0, 7) !== r.endDate.slice(0, 7) || r.startDate.slice(8) !== "01") return false;
  const last = new Date(Date.UTC(Number(r.endDate.slice(0, 4)), Number(r.endDate.slice(5, 7)), 0)).getUTCDate();
  return Number(r.endDate.slice(8)) === last;
}

/** «Sentabr davomati» for one whole month, «Davomat» for any other period. */
export function cardTitle(r: { startDate: string; endDate: string }, t: Translate = interpolate, monthT?: MonthT): string {
  if (!isWholeMonth(r)) return t("Davomat");
  return capitalize(t("{month} davomati", { month: monthFull(r.startDate.slice(0, 7), monthT) }));
}

/** «avgustda 79% edi»; null when there is no earlier figure (before 2026-05 or nothing to divide by). */
export function previousText(
  preset: string,
  previous: { startDate: string; endDate: string } | null,
  previousRate: number | null,
  t: Translate = interpolate,
): string | null {
  if (!previous || previousRate === null) return null;
  return t("{period} {n} edi", { period: previousLabel(preset, previous, t), n: pctText(previousRate) });
}

export const lessonsText = (lessons: number, attended: number, t: Translate = interpolate): string =>
  t("o'tilishi kerak bo'lgan {lessons} darsdan {attended} tasiga kelishgan", {
    lessons: formatNumber(lessons),
    attended: formatNumber(attended),
  });

/**
 * The money block (spec §4.3), two sentences: the counts (every branch), then the money
 * (only the branches with the discount on, or why there is none). Every number is the server's.
 */
export function creditText(c: CreditResult, t: Translate = interpolate): string {
  if (c.lessons === 0) return t("Bu davrda oylik kurslarda sababli dars yo'q.");
  const head = t("{lessons} ta sababli dars ({students} o'quvchi).", { lessons: formatNumber(c.lessons), students: formatNumber(c.students) });
  if (!c.enabled) return `${head} ${t("Sababli dars chegirmasi o'chirilgan.")}`;
  if (!c.amount) return `${head} ${t("Summa hali hisoblanmagan.")}`;
  const money = t("Keyingi oy to'lovidan taxminan {amount} chegiriladi (chegirma yoqilgan filiallar bo'yicha).", { amount: mlnText(c.amount, t) });
  return `${head} ${money}`;
}

export const unchargedText = (n: number, t: Translate = interpolate): string | null =>
  n > 0 ? t("Shundan {n} tasining oyi hali hisoblanmagan, summaga kirmadi.", { n: formatNumber(n) }) : null;

export const hiddenText = (hidden: number, min: number, t: Translate = interpolate): string | null =>
  hidden > 0
    ? t("{hidden} ta qatorda yozuv kam ({min} tadan kam), ro'yxatda yo'q.", { hidden: formatNumber(hidden), min: formatNumber(min) })
    : null;

export const streakText = (n: number, t: Translate = interpolate): string =>
  t("{n} o'quvchi 3 va undan ko'p darsga ketma-ket sababsiz kelmadi.", { n: formatNumber(n) });
