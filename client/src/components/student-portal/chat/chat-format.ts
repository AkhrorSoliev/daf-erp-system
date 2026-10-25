import {
  tashkentDayNumber,
  tashkentDdMm,
  tashkentHhmm,
  tashkentWallClock,
} from "@/lib/tashkent-time";

type Tr = (text: string) => string;
const identity: Tr = (s) => s;

/** «14:05» today, «Kecha» yesterday, «dd.MM» older (Tashkent days). */
export function clockLabel(
  iso: string,
  now: Date = new Date(),
  t: Tr = identity,
): string {
  const diff = tashkentDayNumber(now) - tashkentDayNumber(iso);
  if (diff === 0) return tashkentHhmm(iso);
  if (diff === 1) return t("Kecha");
  return tashkentDdMm(iso);
}

export function peerName(peer: { firstName: string; lastName: string }): string {
  return `${peer.firstName} ${peer.lastName}`.trim();
}

function dayHeader(iso: string, now: Date, t: Tr): string {
  const diff = tashkentDayNumber(now) - tashkentDayNumber(iso);
  if (diff === 0) return t("Bugun");
  if (diff === 1) return t("Kecha");
  return `${tashkentDdMm(iso)}.${tashkentWallClock(iso).getUTCFullYear()}`;
}

/** Consecutive messages of one Tashkent day share a group; order is kept. */
export function groupByDay<M extends { createdAt: string }>(
  messages: M[],
  now: Date = new Date(),
  t: Tr = identity,
): { label: string; items: M[] }[] {
  const groups: { day: number; label: string; items: M[] }[] = [];
  for (const m of messages) {
    const day = tashkentDayNumber(m.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(m);
    else groups.push({ day, label: dayHeader(m.createdAt, now, t), items: [m] });
  }
  return groups.map(({ label, items }) => ({ label, items }));
}

export function unreadTotal(list: { unread: number }[]): number {
  return list.reduce((sum, c) => sum + c.unread, 0);
}
