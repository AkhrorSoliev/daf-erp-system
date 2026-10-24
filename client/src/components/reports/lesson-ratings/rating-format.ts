import type { CommentState } from "./types";
import { formatNumber, formatPercent } from "@/lib/format-utils";
import { msg } from "@/i18n/msg";
import { interpolate } from "@/i18n/translate";
import type { Translate } from "@/components/notifications/notification-view";

/** Baholar shu oydan beri yig'iladi (spec 2026-10-13). */
export const RATING_FLOOR_MONTH = "2026-10";

const oneDecimal = (x: number) => x.toFixed(1).replace(".", ",");

export function averageText(average: number | null): string {
  return average === null ? "—" : `${oneDecimal(average)} ⭐`;
}

export function trend(
  current: number | null,
  previous: number | null,
  t: Translate = interpolate,
): { text: string; tone: "up" | "down" | "same" } | null {
  if (current === null || previous === null) return null;
  const diff = Math.round((current - previous) * 10) / 10;
  if (diff === 0) return { text: t("o'zgarmadi"), tone: "same" };
  return diff > 0
    ? { text: `↑ ${oneDecimal(diff)}`, tone: "up" }
    : { text: `↓ ${oneDecimal(-diff)}`, tone: "down" };
}

export function responseText(rated: number, delivered: number, rate: number | null): string {
  return rate === null ? "—" : `${formatNumber(rated)} / ${formatNumber(delivered)} · ${formatPercent(rate)}`;
}

/** Gorizontal chiziq kengligi: eng uzun chiziq 100%. */
export function barPercent(count: number, max: number): string {
  return max <= 0 ? "0%" : `${Math.round((count / max) * 100)}%`;
}

/** "2026-10-05" → "05.10.2026". */
export function dayText(date: string): string {
  const [y, m, d] = date.split("-");
  return `${d}.${m}.${y}`;
}

/** Uzun izoh qisqartiriladi va «Ko'proq o'qish» chiqadi. */
export const LONG_COMMENT = 140;

export function isLongComment(text: string, limit = LONG_COMMENT): boolean {
  return text.length > limit;
}

/** Izoh holati belgisi: matn va rang. */
export function commentStateLabel(state: CommentState): {
  text: string;
  tone: "green" | "muted" | "amber";
} {
  switch (state) {
    case "WRITTEN":
      return { text: msg("Yozdi"), tone: "green" };
    case "PENDING":
      return { text: msg("Izoh kutilmoqda"), tone: "amber" };
    default:
      return { text: msg("Yozmadi"), tone: "muted" };
  }
}
