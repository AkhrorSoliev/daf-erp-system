import type { DafSkill, DarajaHolati, Platforma } from "./types";

export const PLATFORMA_NOMLARI: Record<Platforma, string> = {
  WEB: "Veb",
  ANDROID: "Android",
  IOS: "iOS",
};

export const KONIKMA_NOMLARI: Record<DafSkill, { uz: string; de: string }> = {
  WORTSCHATZ: { uz: "Lug'at", de: "Wortschatz" },
  GRAMMATIK: { uz: "Grammatika", de: "Grammatik" },
  LESEN: { uz: "O'qish", de: "Lesen" },
  HOEREN: { uz: "Tinglash", de: "Hören" },
  SCHREIBEN: { uz: "Yozish", de: "Schreiben" },
  SPRECHEN: { uz: "Gapirish", de: "Sprechen" },
};

export const DARAJA_HOLATI_NOMLARI: Record<DarajaHolati, string> = {
  DAVOM: "Davom etmoqda",
  TUGATILGAN: "Tugatilgan",
  BOSHLANMAGAN: "Boshlanmagan",
  KURS_YOQ: "Kurs hali yo'q",
};

export function formatDavomiylik(soniya: number): string {
  if (soniya <= 0) return "0 daq";
  if (soniya < 60) return "<1 daq";
  const daqiqa = Math.floor(soniya / 60);
  const soat = Math.floor(daqiqa / 60);
  const qoldiq = daqiqa % 60;
  if (soat === 0) return `${qoldiq} daq`;
  return qoldiq === 0 ? `${soat} soat` : `${soat} soat ${qoldiq} daq`;
}

/** `YYYY-MM-DD` → `DD.MM`. Satrdan o'qiladi — brauzer vaqt mintaqasi aralashmaydi. */
export function formatKunOy(sana: string): string {
  return `${sana.slice(8, 10)}.${sana.slice(5, 7)}`;
}

const HAFTA = ["Yak", "Du", "Se", "Chor", "Pay", "Ju", "Sha"];

export function haftaKuni(sana: string): string {
  return HAFTA[new Date(`${sana}T00:00:00Z`).getUTCDay()];
}

export function formatKunYorligi(sana: string): string {
  return `${formatKunOy(sana)} (${haftaKuni(sana)})`;
}

const TOSHKENT_MS = 5 * 60 * 60 * 1000;
const toshkent = (d: Date) => new Date(d.getTime() + TOSHKENT_MS);
const kunKaliti = (d: Date) => toshkent(d).toISOString().slice(0, 10);
const soatDaqiqa = (d: Date) => toshkent(d).toISOString().slice(11, 16);

export function formatOxirgiFaollik(iso: string | null, now: Date): string {
  if (!iso) return "Ilovaga hali kirmagan";
  const vaqt = new Date(iso);
  if (now.getTime() - vaqt.getTime() < 5 * 60 * 1000) return "Hozirgina";
  const farq = Math.round(
    (new Date(`${kunKaliti(now)}T00:00:00Z`).getTime() -
      new Date(`${kunKaliti(vaqt)}T00:00:00Z`).getTime()) /
      86_400_000,
  );
  if (farq <= 0) return `Bugun, ${soatDaqiqa(vaqt)}`;
  if (farq === 1) return `Kecha, ${soatDaqiqa(vaqt)}`;
  return `${farq} kun oldin`;
}

export function formatSanaVaqt(iso: string): string {
  const d = new Date(iso);
  return `${formatKunOy(kunKaliti(d))} · ${soatDaqiqa(d)}`;
}

/**
 * Davomat statistikasidagi chegaralar: 80 va 60. `amber-*` ISHLATILMAYDI —
 * `globals.css` `@theme` uni faqat `.lumio` ichidagi o'zgaruvchilarga bog'lagan.
 */
export function foizRangi(foiz: number | null): string {
  if (foiz === null) return "text-muted-foreground";
  if (foiz >= 80) return "text-green-600 dark:text-green-400";
  if (foiz >= 60) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
}

export function foizUstunRangi(foiz: number): string {
  if (foiz >= 80) return "bg-green-500";
  if (foiz >= 60) return "bg-yellow-400";
  return "bg-red-500";
}
