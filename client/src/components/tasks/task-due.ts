const OFFSET = 5 * 3600_000;
const PRIORITY_RANK: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
const WEEKDAY = ["Yak", "Du", "Se", "Cho", "Pa", "Ju", "Sha"];
const tDay = (d: Date) => Math.floor((d.getTime() + OFFSET) / 86_400_000);
const hhmm = (d: Date) => { const t = new Date(d.getTime() + OFFSET); return `${String(t.getUTCHours()).padStart(2, "0")}:${String(t.getUTCMinutes()).padStart(2, "0")}`; };
const ddmm = (d: Date) => { const t = new Date(d.getTime() + OFFSET); return `${String(t.getUTCDate()).padStart(2, "0")}.${String(t.getUTCMonth() + 1).padStart(2, "0")}`; };

export type DueState = "overdue" | "today" | "soon" | "later" | "none";
export function dueState(dueAt: string | null, now: Date): DueState {
  if (!dueAt) return "none";
  const d = new Date(dueAt);
  if (d.getTime() < now.getTime()) return "overdue";
  const diff = tDay(d) - tDay(now);
  if (diff === 0) return "today";
  if (diff <= 7) return "soon";
  return "later";
}
export function formatDue(dueAt: string, now: Date): string {
  const d = new Date(dueAt);
  const diff = tDay(d) - tDay(now);
  if (diff === 0) return `Bugun ${hhmm(d)}`;
  if (diff === 1) return `Ertaga ${hhmm(d)}`;
  if (diff > 1 && diff <= 6) return `${WEEKDAY[new Date(d.getTime() + OFFSET).getUTCDay()]}, ${ddmm(d)}`;
  return ddmm(d);
}
const GROUPS: { key: DueState; label: string }[] = [
  { key: "overdue", label: "Muddati o'tgan" }, { key: "today", label: "Bugun" },
  { key: "soon", label: "Shu hafta" }, { key: "later", label: "Keyinroq" }, { key: "none", label: "Muddatsiz" },
];
export function groupByDue<T extends { dueAt: string | null; priority: string }>(cards: T[], now: Date) {
  const by = new Map<DueState, T[]>();
  for (const c of cards) { const k = dueState(c.dueAt, now); by.set(k, [...(by.get(k) ?? []), c]); }
  return GROUPS.filter((g) => by.has(g.key)).map((g) => ({
    ...g,
    items: [...by.get(g.key)!].sort((a, b) => (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9) || (a.dueAt ?? "").localeCompare(b.dueAt ?? "")),
  }));
}
