import { tashkentWallClock } from "@/lib/tashkent-time";

/**
 * `GET /absence-pause/history` qatori. Server faqat o'zgargan kalitlarni
 * saqlaydi (`computeChangedFields`), shuning uchun `oldValues`/`newValues`
 * ichida faqat o'sha maydonlar bor.
 */
export interface AbsencePauseHistoryEntry {
  id: string;
  action: string;
  createdAt: string;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  changedBy: { id: number; firstName: string; lastName: string } | null;
}

export interface AbsencePauseHistoryPage {
  data: AbsencePauseHistoryEntry[];
  total: number;
  page: number;
  pageSize: number;
}

export type HistoryKind = "on" | "off" | "edit";

export interface HistoryLine {
  kind: HistoryKind;
  title: string;
  detail: string | null;
}

const FIELD_LABELS: Record<string, string> = {
  warnThreshold: "Xabar chegarasi",
  pauseThreshold: "Pauza chegarasi",
  dailyCap: "Kunlik chegara",
};

const pad2 = (v: number) => String(v).padStart(2, "0");

/** «dd.MM.yyyy, HH:mm» (soniya bilan: «HH:mm:ss») — Toshkent vaqti. */
export function formatStamp(iso: string, withSeconds = false): string {
  const t = tashkentWallClock(iso);
  const date = `${pad2(t.getUTCDate())}.${pad2(t.getUTCMonth() + 1)}.${t.getUTCFullYear()}`;
  const time = `${pad2(t.getUTCHours())}:${pad2(t.getUTCMinutes())}${
    withSeconds ? `:${pad2(t.getUTCSeconds())}` : ""
  }`;
  return `${date}, ${time}`;
}

export function actorName(entry: AbsencePauseHistoryEntry): string {
  const by = entry.changedBy;
  if (!by) return "Tizim";
  const last = by.lastName.trim();
  return last ? `${by.firstName} ${last.charAt(0)}.` : by.firstName;
}

function changeLines(entry: AbsencePauseHistoryEntry): string[] {
  const next = entry.newValues ?? {};
  const prev = entry.oldValues ?? {};
  return Object.keys(FIELD_LABELS)
    .filter((key) => key in next)
    .map((key) => `${FIELD_LABELS[key]} ${String(prev[key] ?? "—")} → ${String(next[key])}`);
}

export function describeEntry(entry: AbsencePauseHistoryEntry): HistoryLine {
  const next = entry.newValues ?? {};
  const rest = changeLines(entry);
  const detail = rest.length > 0 ? rest.join("; ") : null;
  if (typeof next.enabled === "boolean") {
    return {
      kind: next.enabled ? "on" : "off",
      title: next.enabled ? "Yoqildi" : "O'chirildi",
      detail,
    };
  }
  return { kind: "edit", title: "Chegaralar o'zgardi", detail };
}

/** Kartadagi bitta qator: «Yoqildi · Ahror S. · 18.10.2026, 14:32». */
export function lastChangeText(entry: AbsencePauseHistoryEntry): string {
  return `${describeEntry(entry).title} · ${actorName(entry)} · ${formatStamp(entry.createdAt)}`;
}
