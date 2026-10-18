/**
 * Arxiv yon oynasi va «Sabab» ustuni uchun sof qoidalar (DOM yo'q, vitest bilan
 * sinaladi). Hech qanday hisob-kitob serverniki; bu yerda faqat matn tanlanadi.
 */

export type DetailType = "students" | "groups";

export function isDetailType(t: string): t is DetailType {
  return t === "students" || t === "groups";
}

/** Server guruhni sababsiz o'chirsa «O'chirildi» deb yozadi: bu sabab emas. */
const DEFAULT_REASON = "O'chirildi";

export function archiveReason(item: {
  statusChangeReason?: string | null;
}): string | null {
  const text = item.statusChangeReason?.trim();
  if (!text || text === DEFAULT_REASON) return null;
  return text;
}

export function personName(
  p?: { firstName?: string | null; lastName?: string | null } | null,
): string {
  const name = [p?.firstName, p?.lastName].filter(Boolean).join(" ").trim();
  return name || "Noma'lum";
}

/** Yon oynada ro'yxat qisqa turadi; `total` serverning `_count` jami soni. */
export function capRows<T>(
  rows: T[],
  total: number,
  cap = 10,
): { shown: T[]; hidden: number } {
  const shown = rows.slice(0, cap);
  return { shown, hidden: Math.max(0, total - shown.length) };
}
