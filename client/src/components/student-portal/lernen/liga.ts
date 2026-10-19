import type { Liga, LigaDarajasi } from "./types";

/**
 * Liga nomlari va chegaralari — serverdagi `daf/liga/liga-qoidalari.ts` bilan
 * bir xil (`liga.test.ts` ularni o'sha fayldan o'qib solishtiradi).
 */
export const LIGA_NOMLARI = ["Bronza", "Kumush", "Oltin", "Yoqut", "Olmos"] as const;
export const KOTARILISH_MIN_BALL = 50;
export const KOTARILISH_MIN_AZO = 15;
export const GOLIB_MIN_BALL = 50;
export const GOLIB_MIN_AZO = 5;

const kunRaqami = (s: string) =>
  Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10))) / 86_400_000;

/** «Hafta tugashiga N kun · M kishi»; `bugun` — Toshkent sanasi (`tashkentNow().dateStr`). */
export function haftaMatni(haftaOxiri: string, bugun: string, hajmi: number | null): string {
  const kun = kunRaqami(haftaOxiri) - kunRaqami(bugun) + 1;
  const hafta = kun <= 1 ? "Hafta bugun tugaydi" : `Hafta tugashiga ${kun} kun`;
  return hajmi == null ? hafta : `${hafta} · ${hajmi} kishi`;
}

/** Xona jadvali ustidagi izoh: zona faol / xona kichik / eng yuqori liga. */
export function kotarilishMatni(z: { soni: number; faol: boolean }): string {
  if (z.soni === 0) return "Eng yuqori liga — bu yerdan ko'tarilish yo'q";
  return z.faol
    ? `Birinchi ${z.soni} tasi ko'tariladi (kamida ${KOTARILISH_MIN_BALL} ball)`
    : `Xona hali kichik — ko'tarilish ≥ ${KOTARILISH_MIN_AZO} kishi bo'lganda`;
}

/**
 * «O'tgan hafta» qatori. Daraja faqat o'sadi va ko'tarilish bir pog'ona, shuning
 * uchun ko'tarilgan o'quvchining hozirgi darajasi — yetgan ligasi.
 */
export function otganHaftaMatni(o: NonNullable<Liga["otganHafta"]>, joriy: LigaDarajasi): string {
  return o.kotarildi
    ? `Siz ${o.orin}-o'rin · ${joriy.nomi} ligasiga ko'tarildingiz`
    : `Siz ${o.orin}-o'rin · ${o.hajmi} kishi`;
}

/** Qator ko'tarilish zonasidami (yashil): zona faol va birinchi `soni` ta ichida. */
export function zonadami(platz: number, z: { soni: number; faol: boolean }): boolean {
  return z.faol && platz <= z.soni;
}

/** Guruh bahosi: o'nlik vergul bilan, «12,5 ball». */
export function bahoMatni(baho: number): string {
  return `${String(baho).replace(".", ",")} ball`;
}
