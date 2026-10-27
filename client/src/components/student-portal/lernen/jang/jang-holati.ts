import type { JangBoshlandi, JangJavobNatijasi } from "../types";

/** Server `SAVOL_MS` bilan bir xil — taymer faqat ko'rsatish uchun, vaqtni server o'lchaydi. */
export const SAVOL_MS = 10_000;

/**
 * Server `JAVOB_KORISH_MS` (server/src/daf/jang/jang-qoidalari.ts) bilan BIR XIL bo'lishi SHART.
 * Javob kelgach mijoz natija kartasini ko'rsatadi, server esa keyingi savol vaqtini
 * shuncha kechikib boshlaydi. Mijozda kichikroq bo'lsa, tez to'g'ri javoblar 400
 * "Savol hali ochilmagan" bilan yiqiladi; kattaroq bo'lsa, javob muhlati yeyiladi.
 */
export const JAVOB_KORISH_MS = 1500;

interface Hisob {
  men: number;
  raqib: number;
}

export type JangBosqichi =
  | { tur: "kirish"; jang: JangBoshlandi }
  | { tur: "savol"; jang: JangBoshlandi; pozitsiya: number; hisob: Hisob }
  | { tur: "javob"; jang: JangBoshlandi; pozitsiya: number; hisob: Hisob; natija: JangJavobNatijasi; berilgan: string }
  | { tur: "tugadi"; jang: JangBoshlandi; hisob: Hisob };

export type JangHarakati =
  | { tur: "boshlandi"; jang: JangBoshlandi }
  | { tur: "kirish-tugadi" }
  | { tur: "javob-keldi"; natija: JangJavobNatijasi; berilgan: string }
  | { tur: "keyingi" };

/** Bosqichga mos kelmagan harakat (masalan, kech kelgan taymer) holatni o'zgartirmaydi. */
export function jangReducer(h: JangBosqichi | null, a: JangHarakati): JangBosqichi | null {
  if (a.tur === "boshlandi") return { tur: "kirish", jang: a.jang };
  if (!h) return h;
  if (a.tur === "kirish-tugadi" && h.tur === "kirish") {
    return { tur: "savol", jang: h.jang, pozitsiya: 0, hisob: { men: 0, raqib: 0 } };
  }
  if (a.tur === "javob-keldi" && h.tur === "savol") {
    return {
      ...h,
      tur: "javob",
      natija: a.natija,
      berilgan: a.berilgan,
      hisob: {
        men: h.hisob.men + (a.natija.togri ? 1 : 0),
        raqib: h.hisob.raqib + (a.natija.raqib.togri ? 1 : 0),
      },
    };
  }
  if (a.tur === "keyingi" && h.tur === "javob") {
    const p = h.pozitsiya + 1;
    return p < h.jang.savollar.length
      ? { tur: "savol", jang: h.jang, pozitsiya: p, hisob: h.hisob }
      : { tur: "tugadi", jang: h.jang, hisob: h.hisob };
  }
  return h;
}
