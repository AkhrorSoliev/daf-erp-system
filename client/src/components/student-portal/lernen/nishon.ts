import { GOLIB_MIN_AZO, GOLIB_MIN_BALL, LIGA_NOMLARI } from "./liga";
import type { NishonQatori } from "./types";

/**
 * Nishon nomi KALITDAN quriladi (serverda matn yo'q, spec S2 2.3, S3 §3):
 * `SERIE_14` → «14 kun ketma-ket», `WOERTER_150` → «150 ta so'z»,
 * `LIGA_KUMUSH` → «Kumush ligasi».
 */
export function nishonNomi(key: string): string {
  const liga = /^LIGA_([A-Z]+)$/.exec(key);
  if (liga) {
    const nom = LIGA_NOMLARI.find((n) => n.toUpperCase() === liga[1]);
    return nom ? `${nom} ligasi` : key;
  }
  if (key === "XONA_GOLIB") return "Xona g'olibi";
  if (key === "GURUH_BIRINCHI") return "Guruhlar jadvalida 1-o'rin";
  const m = /^(SERIE|WOERTER)_(\d+)$/.exec(key);
  if (!m) return key;
  const n = Number(m[2]);
  if (m[1] === "SERIE") return `${n} kun ketma-ket`;
  return n === 592 ? "A1 so'zlarining hammasi" : `${n} ta so'z`;
}

/**
 * Olinmagan nishonning ostidagi yozuv; olinganda `null`. XONA/GURUH nishonlari
 * serverdan `qoldi = 1` bilan keladi (chegara 1) — «yana 1 …» yozilmaydi,
 * o'rniga nima qilish kerakligi aytiladi.
 */
export function nishonQoldi(q: NishonQatori): string | null {
  if (q.olingan) return null;
  if (!q.qoldi) return "Keyingi mashqda beriladi";
  switch (q.tur) {
    case "SERIE":
      return `yana ${q.qoldi} kun`;
    case "WOERTER":
      return `yana ${q.qoldi} ta so'z`;
    case "LIGA": {
      const nom = LIGA_NOMLARI[q.chegara];
      return nom ? `${nom} ligasiga ko'tarilganda` : "Yuqori ligaga ko'tarilganda";
    }
    case "XONA":
      return `Xonada 1-o'rin, kamida ${GOLIB_MIN_BALL} ball, xonada kamida ${GOLIB_MIN_AZO} kishi bo'lsa`;
    case "GURUH":
      return "Guruhingiz hafta jadvalida 1-o'rin olganda";
    default:
      // Newer server may add a badge kind this client does not know yet.
      return null;
  }
}
