import { msg } from "@/i18n/msg";
import { interpolate } from "@/i18n/translate";
import { formatNumber } from "@/lib/format-utils";
import type { Translate } from "@/components/notifications/notification-view";
import type { GroupRow, Heat, HeatInsight, HeatTone, InsightSlot, WeekDay } from "./center-activity-types";

export const DAY_SHORT: Record<WeekDay, string> = {
  monday: msg("Du"), tuesday: msg("Se"), wednesday: msg("Chor"), thursday: msg("Pay"), friday: msg("Ju"), saturday: msg("Sha"),
};

export const DAY_FULL: Record<WeekDay, string> = {
  monday: msg("Dushanba"), tuesday: msg("Seshanba"), wednesday: msg("Chorshanba"), thursday: msg("Payshanba"), friday: msg("Juma"), saturday: msg("Shanba"),
};

/** «27%»: the server's one-decimal figure shown whole; «—» when the server had none (no rooms, no seats). */
export const pctText = (n: number | null): string => (n === null ? "—" : `${Math.round(n)}%`);

export const daysLabel = (days: WeekDay[], t: Translate = interpolate): string =>
  days.map((d) => DAY_SHORT[d]).map((name) => t(name)).join("-");

/** «Du-Chor-Ju 10:00» */
export const scheduleText = (g: Pick<GroupRow, "days" | "start">, t: Translate = interpolate): string =>
  g.start ? `${daysLabel(g.days, t)} ${g.start}` : daysLabel(g.days, t);

/** «93 mln» from a million, «450 000 so'm» below. */
export const mlnText = (n: number, t: Translate = interpolate): string =>
  n >= 1_000_000 ? `${Math.round(n / 1_000_000)} ${t("mln")}` : `${formatNumber(n)} ${t("so'm")}`;

export const hourLabel = (h: number): string => String(h).padStart(2, "0");

/** «7 ta xona bo'sh» — one text for the matrix cells, the insight and the detail title. */
export const freeRoomsText = (n: number, t: Translate = interpolate): string => t("{n} ta xona bo'sh", { n });

const hh = (h: number) => `${hourLabel(h)}:00`;
const freeText = (s: InsightSlot, t: Translate) =>
  s.freeMin === s.freeMax ? freeRoomsText(s.freeMin, t) : t("{min}–{max} xona bo'sh", { min: s.freeMin, max: s.freeMax });
const slotText = (s: InsightSlot, t: Translate) => `${daysLabel(s.days, t)} ${hh(s.fromHour)}–${hh(s.toHour)} (${freeText(s, t)})`;

/** The two lines under the table; the server gives structure, the words are here. */
export function insightSentences(i: HeatInsight, t: Translate = interpolate): { quiet: string[]; busy: string | null } {
  return { quiet: i.quiet.map((s) => slotText(s, t)), busy: i.busy ? slotText(i.busy, t) : null };
}

/** HTML cell colours (not SVG): the free share of rooms, from the server's tone. */
export const HEAT_CLASS: Record<HeatTone, string> = {
  green: "bg-emerald-600 text-white",
  light: "bg-emerald-100 text-emerald-800 dark:bg-emerald-700/50 dark:text-emerald-100 dark:ring-1 dark:ring-emerald-400/40",
  yellow: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  red: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

export const HEAT_HINT = msg("Katakni bosing: o'sha soatda qaysi xonalar bo'sh ekanini ko'rasiz.");
export const HEAT_NO_FREE = msg("Bu soatda bo'sh xona yo'q.");

export interface HeatDetail {
  /** «Dushanba, 09:00–10:00 — 7 ta xona bo'sh» */
  title: string;
  /** «1-xona · 14 o'rin»; just the name when the room has no capacity. */
  free: { id: string; text: string }[];
  /** `groups` is «Standart-04, A1-07». */
  busy: { id: string; name: string; groups: string }[];
}

/** One heat cell opened up: which rooms are free in that hour and which groups hold the busy ones. null when the cell is not in this heat. */
export function heatDetail(heat: Heat, day: WeekDay, hour: number, t: Translate = interpolate): HeatDetail | null {
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
    else free.push({ id: r.id, text: r.capacity === null ? r.name : `${r.name} · ${t("{n} o'rin", { n: r.capacity })}` });
  });
  const dayName = DAY_FULL[day];
  return { title: `${t(dayName)}, ${hh(hour)}–${hh(hour + 1)} — ${freeRoomsText(free.length, t)}`, free, busy };
}
