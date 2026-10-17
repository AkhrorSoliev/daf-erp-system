import { tashkentWallClock } from "@/lib/tashkent-time";
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
  if (preset === "current_month" || preset === "last_month") {
    return LOCATIVE[Number(previous.startDate.slice(5, 7)) - 1] ?? "oldingi davrda";
  }
  if (preset === "3m") return "oldingi 3 oyda";
  if (preset === "6m") return "oldingi 6 oyda";
  return "oldingi davrda";
}

/** dd.MM.yyyy of the Tashkent day an instant falls on. */
export function formatDay(iso: string): string {
  const t = tashkentWallClock(iso);
  const dd = String(t.getUTCDate()).padStart(2, "0");
  const mm = String(t.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${t.getUTCFullYear()}`;
}
