import { addDays, format, startOfWeek } from "date-fns";

/** Filtrdagi tez tugmalar: ular faqat «Boshi — Oxiri» oralig'ini to'ldiradi. */
export type DatePreset = "today" | "yesterday" | "thisWeek";

export const DATE_PRESETS: { key: DatePreset; label: string }[] = [
  { key: "today", label: "Bugun" },
  { key: "yesterday", label: "Kecha" },
  { key: "thisWeek", label: "Shu hafta" },
];

/** Tugmaning kunlari; «Shu hafta» — dushanbadan bugungacha. */
export function presetRange(
  preset: DatePreset,
  today: Date,
): { start: Date; end: Date } {
  const day = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (preset === "today") return { start: day, end: day };
  if (preset === "yesterday") {
    const yesterday = addDays(day, -1);
    return { start: yesterday, end: yesterday };
  }
  return { start: startOfWeek(day, { weekStartsOn: 1 }), end: day };
}

/**
 * Tanlangan oraliq qaysi tugmaning kunlariga teng. Dushanba kuni «Bugun» va
 * «Shu hafta» bir xil — birinchisi, «Bugun», qaytadi.
 */
export function activePreset(
  start: Date | null,
  end: Date | null,
  today: Date,
): DatePreset | null {
  if (!start || !end) return null;
  const key = (d: Date) => format(d, "yyyy-MM-dd");
  const match = DATE_PRESETS.find(({ key: preset }) => {
    const r = presetRange(preset, today);
    return key(r.start) === key(start) && key(r.end) === key(end);
  });
  return match?.key ?? null;
}

/**
 * Kartadagi o'zgarish foizi qaysi kunlar bilan solishtirilganini aytadi.
 * Sanalar serverdan keladi (`comparedTo`, Toshkent kunlari). Yil faqat joriy
 * yil bo'lmasa yoki oraliq ikki yilga tushsa yoziladi.
 */
export function comparisonLabel(
  compared: { startDate: string; endDate: string },
  today: Date,
): string {
  const [sy, sm, sd] = compared.startDate.split("-");
  const [ey, em, ed] = compared.endDate.split("-");
  const withYear = sy !== ey || sy !== String(today.getFullYear());
  const dayLabel = (y: string, m: string, d: string) =>
    withYear ? `${d}.${m}.${y}` : `${d}.${m}`;
  const label =
    compared.startDate === compared.endDate
      ? dayLabel(sy, sm, sd)
      : `${dayLabel(sy, sm, sd)}–${dayLabel(ey, em, ed)}`;
  return `${label} bilan solishtirganda`;
}
