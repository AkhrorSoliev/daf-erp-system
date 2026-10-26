import { msg } from "@/i18n/msg";

// «Soliq va komissiyalar» sahifasining qoralama qoidalari. Server (`tax-rates.ts`)
// hammasini baribir qayta tekshiradi; bu yerda faqat «Saqlash»ni yoqish va
// xatoni joyida ko'rsatish uchun.

export type RateRow = { fromMonth: string; value: string };
export type TierRow = { fromAmount: string; toAmount: string; percent: string };
export type DatedRate = { fromMonth: string; value: number };
export type BankTier = { fromAmount: number; toAmount: number | null; percent: number };
export type DatedTiers = { fromMonth: string; tiers: BankTier[] };

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

export function tiersError(rows: TierRow[]): string | null {
  if (rows.length === 0) return msg("Kamida bitta oraliq kiriting");
  if (rows.some((r) => !/^\d*$/.test(r.fromAmount) || !/^\d*$/.test(r.toAmount))) return msg("Faqat butun so'm kiriting");
  if (Number(rows[0].fromAmount) !== 0) return msg("1-oraliq 0 dan boshlanadi");
  if (rows[rows.length - 1].toAmount.trim() !== "") return msg("Oxirgi oraliqning yuqori chegarasi bo'sh qoladi");
  for (let i = 0; i < rows.length; i++) {
    const err = percentError(rows[i].percent);
    if (err) return err;
    if (i < rows.length - 1) {
      const to = Number(rows[i].toAmount);
      if (!(to > Number(rows[i].fromAmount))) return msg("Oraliq chegarasi noto'g'ri");
      if (Number(rows[i + 1].fromAmount) !== to) return msg("Oraliqlar orasida bo'shliq bor");
    }
  }
  return null;
}

export const toRatePayload = (rows: RateRow[]): DatedRate[] =>
  rows.map((r) => ({ fromMonth: r.fromMonth, value: Number(r.value) }));

export const toTierPayload = (fromMonth: string, rows: TierRow[]): DatedTiers => ({
  fromMonth,
  tiers: rows.map((r) => ({
    fromAmount: Number(r.fromAmount),
    toAmount: r.toAmount.trim() === "" ? null : Number(r.toAmount),
    percent: Number(r.percent),
  })),
});

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
