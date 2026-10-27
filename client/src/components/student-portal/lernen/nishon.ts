import { interpolate } from "@/i18n/translate";
import { GOLIB_MIN_AZO, GOLIB_MIN_BALL, LIGA_NOMLARI, ligaSarlavhasi, type Translate } from "./liga";
import type { NishonQatori } from "./types";

/**
 * Nishon nomi KALITDAN quriladi (serverda matn yo'q, spec S2 2.3, S3 §3):
 * `SERIE_14` → «14 kun ketma-ket», `WOERTER_150` → «150 ta so'z»,
 * `LIGA_KUMUSH` → «Kumush ligasi».
 */
export function nishonNomi(key: string, t: Translate = interpolate): string {
  const liga = /^LIGA_([A-Z]+)$/.exec(key);
  if (liga) {
    const nom = LIGA_NOMLARI.find((n) => n.toUpperCase() === liga[1]);
    return nom ? ligaSarlavhasi(nom, t) : key;
  }
  if (key === "XONA_GOLIB") return t("Xona g'olibi");
  if (key === "GURUH_BIRINCHI") return t("Guruhlar jadvalida 1-o'rin");
  const jang = /^JANG_(\d+)$/.exec(key);
  if (jang) return t("{n} ta jang g'alabasi", { n: Number(jang[1]) });
  const m = /^(SERIE|WOERTER)_(\d+)$/.exec(key);
  if (!m) return key;
  const n = Number(m[2]);
  if (m[1] === "SERIE") return t("{n} kun ketma-ket", { n });
  return n === 592 ? t("A1 so'zlarining hammasi") : t("{n} ta so'z", { n });
}

/**
 * Olinmagan nishonning ostidagi yozuv; olinganda `null`. XONA/GURUH nishonlari
 * serverdan `qoldi = 1` bilan keladi (chegara 1) — «yana 1 …» yozilmaydi,
 * o'rniga nima qilish kerakligi aytiladi.
 */
export function nishonQoldi(q: NishonQatori, t: Translate = interpolate): string | null {
  if (q.olingan) return null;
  if (!q.qoldi) return t("Keyingi mashqda beriladi");
  switch (q.tur) {
    case "SERIE":
      return t("yana {n} kun", { n: q.qoldi });
    case "WOERTER":
      return t("yana {n} ta so'z", { n: q.qoldi });
    case "LIGA": {
      const nom = LIGA_NOMLARI[q.chegara];
      return nom
        ? t("{name} ligasiga ko'tarilganda", { name: t(nom) })
        : t("Yuqori ligaga ko'tarilganda");
    }
    case "XONA":
      return t("Xonada 1-o'rin, kamida {points} ball, xonada kamida {n} kishi bo'lsa", {
        points: GOLIB_MIN_BALL,
        n: GOLIB_MIN_AZO,
      });
    case "GURUH":
      return t("Guruhingiz hafta jadvalida 1-o'rin olganda");
    case "JANG":
      return t("yana {n} ta g'alaba", { n: q.qoldi });
    default:
      // Newer server may add a badge kind this client does not know yet.
      return null;
  }
}
