import {
  tashkentDayNumber as tDay,
  tashkentDdMm as ddmm,
  tashkentHhmm as hhmm,
  tashkentWallClock,
} from "@/lib/tashkent-time";
import { msg } from "@/i18n/msg";
import { uzbek, type Translate } from "./task-labels";

const PRIORITY_RANK: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
const WEEKDAY = [msg("Yak"), msg("Du"), msg("Se"), msg("Cho"), msg("Pa"), msg("Ju"), msg("Sha")];

export type DueState = "overdue" | "today" | "tomorrow" | "soon" | "later" | "none";
// «soon» is +2…+6 Tashkent days, the same span as the server's `week` filter
// and the weekday form of `formatDue`; +7 and beyond is «later».
export function dueState(dueAt: string | null, now: Date): DueState {
  if (!dueAt) return "none";
  const d = new Date(dueAt);
  if (d.getTime() < now.getTime()) return "overdue";
  const diff = tDay(d) - tDay(now);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff <= 6) return "soon";
  return "later";
}
/** The Tashkent day of an instant as local midnight (what the DatePicker holds) and its "HH:mm"; the inverse of `tashkentDateTime`. */
export function tashkentDayAndTime(iso: string): { day: Date; time: string } {
  const d = new Date(iso);
  const t = tashkentWallClock(d);
  return { day: new Date(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()), time: hhmm(d) };
}
export function formatDue(dueAt: string, now: Date, t: Translate = uzbek): string {
  const d = new Date(dueAt);
  const diff = tDay(d) - tDay(now);
  if (diff === 0) return t("Bugun {time}", { time: hhmm(d) });
  if (diff === 1) return t("Ertaga {time}", { time: hhmm(d) });
  if (diff > 1 && diff <= 6) {
    const day = WEEKDAY[tashkentWallClock(d).getUTCDay()];
    return `${t(day)}, ${ddmm(d)}`;
  }
  return ddmm(d);
}
// msg() labels: the list draws them with t().
const GROUPS: { key: DueState; label: string }[] = [
  { key: "overdue", label: msg("Muddati o'tgan") }, { key: "today", label: msg("Bugun") }, { key: "tomorrow", label: msg("Ertaga") },
  { key: "soon", label: msg("Shu hafta") }, { key: "later", label: msg("Keyinroq") }, { key: "none", label: msg("Muddatsiz") },
];
export function groupByDue<T extends { dueAt: string | null; priority: string }>(cards: T[], now: Date) {
  const by = new Map<DueState, T[]>();
  for (const c of cards) {
    const k = dueState(c.dueAt, now);
    const list = by.get(k);
    if (list) list.push(c); else by.set(k, [c]);
  }
  const dueMs = (c: T) => (c.dueAt ? Date.parse(c.dueAt) : 0);
  return GROUPS.filter((g) => by.has(g.key)).map((g) => ({
    ...g,
    items: by.get(g.key)!.sort((a, b) => (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9) || dueMs(a) - dueMs(b)),
  }));
}
