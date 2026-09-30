import type { QollanmaSahifa } from "../turlar";
import { boshlash } from "./boshlash";
import { davomat } from "./davomat";
import { oquvchilar } from "./oquvchilar";
import { tolovlar } from "./tolovlar";

/**
 * Qo'llanmaning yagona reyestri. Menyu, qidiruv, rol filtri, «?» tugmasi va
 * ADR testi shu ro'yxatdan o'qiydi. Tartib = `bolimlar.ts` tartibi.
 * Yangi bo'lim fayli shu yerga, o'z o'rniga qo'shiladi.
 */
export const sahifalar: QollanmaSahifa[] = [...boshlash, ...oquvchilar, ...davomat, ...tolovlar];

export function sahifaTopish(bolim: string, sahifa: string): QollanmaSahifa | undefined {
  return sahifalar.find((s) => s.bolim === bolim && s.sahifa === sahifa);
}

export function sahifaYoli(s: Pick<QollanmaSahifa, "bolim" | "sahifa">): string {
  return `/qollanma/${s.bolim}/${s.sahifa}`;
}
