import type { Translate } from "@/components/notifications/notification-view";
import { msg } from "@/i18n/msg";
import { interpolate } from "@/i18n/translate";
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
  /** A `msg()` text: draw it with `t(line.title)`. */
  title: string;
  detail: string | null;
}

const FIELD_LABELS: Record<string, string> = {
  warnThreshold: msg("Xabar chegarasi"),
  pauseThreshold: msg("Pauza chegarasi"),
  dailyCap: msg("Kunlik chegara"),
};

const pad2 = (v: number) => String(v).padStart(2, "0");

/** «dd.MM.yyyy, HH:mm» (soniya bilan: «HH:mm:ss») — Toshkent vaqti. */
export function formatStamp(iso: string, withSeconds = false): string {
  const clock = tashkentWallClock(iso);
  const date = `${pad2(clock.getUTCDate())}.${pad2(clock.getUTCMonth() + 1)}.${clock.getUTCFullYear()}`;
  const time = `${pad2(clock.getUTCHours())}:${pad2(clock.getUTCMinutes())}${
    withSeconds ? `:${pad2(clock.getUTCSeconds())}` : ""
  }`;
  return `${date}, ${time}`;
}

export function actorName(entry: AbsencePauseHistoryEntry, t: Translate = interpolate): string {
  const by = entry.changedBy;
  // «Tizim» alone is the colour mode key.
  if (!by) return t("Tizim (avtomatik)");
  const last = by.lastName.trim();
  return last ? `${by.firstName} ${last.charAt(0)}.` : by.firstName;
}

function changeLines(entry: AbsencePauseHistoryEntry, t: Translate): string[] {
  const next = entry.newValues ?? {};
  const prev = entry.oldValues ?? {};
  return Object.keys(FIELD_LABELS)
    .filter((key) => key in next)
    .map((key) => {
      const label = FIELD_LABELS[key];
      return `${t(label)} ${String(prev[key] ?? "—")} → ${String(next[key])}`;
    });
}

export function describeEntry(entry: AbsencePauseHistoryEntry, t: Translate = interpolate): HistoryLine {
  const next = entry.newValues ?? {};
  const rest = changeLines(entry, t);
  const detail = rest.length > 0 ? rest.join("; ") : null;
  if (typeof next.enabled === "boolean") {
    return {
      kind: next.enabled ? "on" : "off",
      title: next.enabled ? msg("Yoqildi") : msg("O'chirildi"),
      detail,
    };
  }
  return { kind: "edit", title: msg("Chegaralar o'zgardi"), detail };
}

/** Kartadagi bitta qator: «Yoqildi · Ahror S. · 18.10.2026, 14:32». */
export function lastChangeText(entry: AbsencePauseHistoryEntry, t: Translate = interpolate): string {
  const title = describeEntry(entry, t).title;
  return `${t(title)} · ${actorName(entry, t)} · ${formatStamp(entry.createdAt)}`;
}
