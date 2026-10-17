import { formatNumber } from "@/lib/format-utils";
import type { GroupRow, Heat, HeatInsight, HeatTone, InsightSlot, WeekDay } from "./center-activity-types";

const DAY_SHORT: Record<WeekDay, string> = {
  monday: "Du", tuesday: "Se", wednesday: "Chor", thursday: "Pay", friday: "Ju", saturday: "Sha",
};

export const DAY_FULL: Record<WeekDay, string> = {
  monday: "Dushanba", tuesday: "Seshanba", wednesday: "Chorshanba", thursday: "Payshanba", friday: "Juma", saturday: "Shanba",
};

/** «27%»: the server's one-decimal figure shown whole; «—» when the server had none (no rooms, no seats). */
export const pctText = (n: number | null): string => (n === null ? "—" : `${Math.round(n)}%`);

export const daysLabel = (days: WeekDay[]): string => days.map((d) => DAY_SHORT[d]).join("-");

/** «Du-Chor-Ju 10:00» */
export const scheduleText = (g: Pick<GroupRow, "days" | "start">): string =>
  g.start ? `${daysLabel(g.days)} ${g.start}` : daysLabel(g.days);

/** «93 mln» from a million, «450 000 so'm» below. */
export const mlnText = (n: number): string =>
  n >= 1_000_000 ? `${Math.round(n / 1_000_000)} mln` : `${formatNumber(n)} so'm`;

export const hourLabel = (h: number): string => String(h).padStart(2, "0");

const hh = (h: number) => `${hourLabel(h)}:00`;
const freeText = (s: InsightSlot) =>
  s.freeMin === s.freeMax ? `${s.freeMin} ta xona bo'sh` : `${s.freeMin}–${s.freeMax} xona bo'sh`;
const slotText = (s: InsightSlot) => `${daysLabel(s.days)} ${hh(s.fromHour)}–${hh(s.toHour)} (${freeText(s)})`;

/** The two lines under the table; the server gives structure, the words are here. */
export function insightSentences(i: HeatInsight): { quiet: string[]; busy: string | null } {
  return { quiet: i.quiet.map(slotText), busy: i.busy ? slotText(i.busy) : null };
}

/** HTML cell colours (not SVG): the free share of rooms, from the server's tone. */
export const HEAT_CLASS: Record<HeatTone, string> = {
  green: "bg-emerald-600 text-white",
  light: "bg-emerald-100 text-emerald-800 dark:bg-emerald-700/50 dark:text-emerald-100 dark:ring-1 dark:ring-emerald-400/40",
  yellow: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  red: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

export const HEAT_HINT = "Katakni bosing: o'sha soatda qaysi xonalar bo'sh ekanini ko'rasiz.";
export const HEAT_NO_FREE = "Bu soatda bo'sh xona yo'q.";

export interface HeatDetail {
  /** «Dushanba, 09:00–10:00 — 7 ta xona bo'sh» */
  title: string;
  /** «1-xona · 14 o'rin»; just the name when the room has no capacity. */
  free: { id: string; text: string }[];
  /** `groups` is «Standart-04, A1-07». */
  busy: { id: string; name: string; groups: string }[];
}

/** One heat cell opened up: which rooms are free in that hour and which groups hold the busy ones. null when the cell is not in this heat. */
export function heatDetail(heat: Heat, day: WeekDay, hour: number): HeatDetail | null {
  const di = heat.days.indexOf(day);
  const hi = heat.hours.indexOf(hour);
  if (di < 0 || hi < 0) return null;
  const cell = heat.cells[di][hi];
  const busyAt = new Map(cell.busy.map((b) => [b.room, b.groups]));
  const free: HeatDetail["free"] = [];
  const busy: HeatDetail["busy"] = [];
  heat.roomList.forEach((r, i) => {
    const groups = busyAt.get(i);
    if (groups) busy.push({ id: r.id, name: r.name, groups: groups.join(", ") });
    else free.push({ id: r.id, text: r.capacity === null ? r.name : `${r.name} · ${r.capacity} o'rin` });
  });
  return { title: `${DAY_FULL[day]}, ${hh(hour)}–${hh(hour + 1)} — ${free.length} ta xona bo'sh`, free, busy };
}
