import { formatNumber } from "@/lib/format-utils";
import { capitalize, monthFull, previousLabel } from "@/components/reports/departed-students/departed-format";
import { mlnText } from "@/components/reports/center-activity/center-activity-format";
import type { CreditResult, CutKey } from "./attendance-types";

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

/** «Sentabr 81%», and «(oy tugamagan)» for a month that has not ended — the spoken text of a month bar. */
export const monthSpoken = (m: { month: string; rate: number | null; partial: boolean }): string =>
  `${monthFull(m.month)} ${pctText(m.rate)}${m.partial ? " (oy tugamagan)" : ""}`;

const WEEKDAY = ["Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba", "Yakshanba"];

/** 1 = dushanba … 7 = yakshanba, the full name. */
export const weekdayName = (day: number): string => WEEKDAY[day - 1] ?? "";

export const CUT_LABEL: Record<CutKey, string> = { group: "Guruhlar", teacher: "Ustozlar", course: "Kurslar" };
export const CUT_COLUMN: Record<CutKey, string> = { group: "Guruh", teacher: "Ustoz", course: "Kurs" };

function isWholeMonth(r: { startDate: string; endDate: string }): boolean {
  if (r.startDate.slice(0, 7) !== r.endDate.slice(0, 7) || r.startDate.slice(8) !== "01") return false;
  const last = new Date(Date.UTC(Number(r.endDate.slice(0, 4)), Number(r.endDate.slice(5, 7)), 0)).getUTCDate();
  return Number(r.endDate.slice(8)) === last;
}

/** «Sentabr davomati» for one whole month, «Davomat» for any other period. */
export function cardTitle(r: { startDate: string; endDate: string }): string {
  return isWholeMonth(r) ? `${capitalize(monthFull(r.startDate.slice(0, 7)))} davomati` : "Davomat";
}

/** «avgustda 79% edi»; null when there is no earlier figure (before 2026-05 or nothing to divide by). */
export function previousText(preset: string, previous: { startDate: string; endDate: string } | null, previousRate: number | null): string | null {
  if (!previous || previousRate === null) return null;
  return `${previousLabel(preset, previous)} ${pctText(previousRate)} edi`;
}

export const lessonsText = (lessons: number, attended: number): string =>
  `o'tilishi kerak bo'lgan ${formatNumber(lessons)} darsdan ${formatNumber(attended)} tasiga kelishgan`;

/**
 * The money block (spec §4.3), two sentences: the counts (every branch), then the money
 * (only the branches with the discount on, or why there is none). Every number is the server's.
 */
export function creditText(c: CreditResult): string {
  if (c.lessons === 0) return "Bu davrda oylik kurslarda sababli dars yo'q.";
  const head = `${formatNumber(c.lessons)} ta sababli dars (${formatNumber(c.students)} o'quvchi).`;
  if (!c.enabled) return `${head} Sababli dars chegirmasi o'chirilgan.`;
  if (!c.amount) return `${head} Summa hali hisoblanmagan.`;
  return `${head} Keyingi oy to'lovidan taxminan ${mlnText(c.amount)} chegiriladi (chegirma yoqilgan filiallar bo'yicha).`;
}

export const unchargedText = (n: number): string | null =>
  n > 0 ? `Shundan ${formatNumber(n)} tasining oyi hali hisoblanmagan, summaga kirmadi.` : null;

export const hiddenText = (hidden: number, min: number): string | null =>
  hidden > 0 ? `${formatNumber(hidden)} ta qatorda yozuv kam (${formatNumber(min)} tadan kam), ro'yxatda yo'q.` : null;

export const streakText = (n: number): string => `${formatNumber(n)} o'quvchi 3 va undan ko'p darsga ketma-ket sababsiz kelmadi.`;
