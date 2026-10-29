import { msg } from "@/i18n/msg";

// «Soliq va komissiyalar» sahifasining qoralama qoidalari. Server (`tax-rates.ts`)
// hammasini baribir qayta tekshiradi; bu yerda faqat «Saqlash»ni yoqish va
// xatoni joyida ko'rsatish uchun.

export type RateRow = { fromMonth: string; value: string };
export type DatedRate = { fromMonth: string; value: number };

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

const percentError = (v: string): string | null => {
  const n = Number(v);
  if (v.trim() === "" || !Number.isFinite(n) || n < 0 || n > 100) return msg("Foiz 0 dan 100 gacha");
  // `toFixed` va server (`isPercent`) bir xil usulda tekshiradi; `n * 100` suzuvchi nuqtada 1.15 ni rad etardi.
  if (Number(n.toFixed(2)) !== n) return msg("Ko'pi bilan 2 kasr");
  return null;
};

export function rowError(row: RateRow): string | null {
  if (!MONTH_RE.test(row.fromMonth)) return msg("Oyni tanlang");
  return percentError(row.value);
}

export const toRatePayload = (rows: RateRow[]): DatedRate[] =>
  rows.map((r) => ({ fromMonth: r.fromMonth, value: Number(r.value) }));

/** Serverning `rateForMonth` ko'zgusi: shu oyda amalda turgan oxirgi qator. */
export function currentRate(list: DatedRate[], month: string): number | null {
  let hit: number | null = null;
  for (const r of list) if (r.fromMonth <= month) hit = r.value;
  return hit;
}

/** Shu oyning qatorini almashtiradi yoki qo'shadi; qolganlari qoladi, oy bo'yicha tartiblanadi. */
export function mergeRateRow(list: DatedRate[], row: DatedRate): DatedRate[] {
  return [...list.filter((r) => r.fromMonth !== row.fromMonth), row].sort((a, b) =>
    a.fromMonth.localeCompare(b.fromMonth),
  );
}

/** Foizni ekranda ko'rsatish: 4 -> «4%», 1.15 -> «1,15%». */
export function percentText(value: number): string {
  return `${String(value).replace(".", ",")}%`;
}

/** Foiz maydoniga yozilganini tozalaydi: vergul nuqtaga aylanadi, bitta nuqta qoladi, harf kirmaydi. */
export function percentInput(raw: string): string {
  const cleaned = raw.replace(",", ".").replace(/[^\d.]/g, "");
  const dot = cleaned.indexOf(".");
  return dot === -1 ? cleaned : cleaned.slice(0, dot + 1) + cleaned.slice(dot + 1).replace(/\./g, "");
}
