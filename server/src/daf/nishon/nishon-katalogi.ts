/**
 * Nishonlar katalogi — BITTA joyda (spec S2 2.1). Jadvalda faqat olingan
 * nishon kaliti saqlanadi, shuning uchun yangi tur (S3 musobaqa nishonlari)
 * migratsiyasiz qo'shiladi. Nom serverda yo'q: mijoz kalitdan quradi.
 */
export type NishonTuri = 'SERIE' | 'WOERTER';

export interface Nishon {
  key: string;
  tur: NishonTuri;
  chegara: number;
}

export const NISHON_KATALOGI: readonly Nishon[] = [
  { key: 'SERIE_3', tur: 'SERIE', chegara: 3 },
  { key: 'SERIE_7', tur: 'SERIE', chegara: 7 },
  { key: 'SERIE_14', tur: 'SERIE', chegara: 14 },
  { key: 'SERIE_30', tur: 'SERIE', chegara: 30 },
  { key: 'SERIE_60', tur: 'SERIE', chegara: 60 },
  { key: 'SERIE_100', tur: 'SERIE', chegara: 100 },
  { key: 'WOERTER_50', tur: 'WOERTER', chegara: 50 },
  { key: 'WOERTER_150', tur: 'WOERTER', chegara: 150 },
  { key: 'WOERTER_300', tur: 'WOERTER', chegara: 300 },
  // A1 dagi hamma so'z.
  { key: 'WOERTER_592', tur: 'WOERTER', chegara: 592 },
];

/** `serie` — joriy seriya (kun); `woerter` — kamida bir marta to'g'ri javob berilgan so'zlar. */
export interface NishonSharoiti {
  serie: number;
  woerter: number;
}

function joriy(tur: NishonTuri, s: NishonSharoiti): number {
  return tur === 'SERIE' ? s.serie : s.woerter;
}

/** Sharti bajarilgan kalitlar, katalog tartibida (olingan-olinmaganidan qat'i nazar). */
export function shartBajarilganlar(s: NishonSharoiti): string[] {
  return NISHON_KATALOGI.filter((n) => joriy(n.tur, s) >= n.chegara).map(
    (n) => n.key,
  );
}

/** «yana N kun / N ta so'z»: chegaragacha qolgani, 0 dan past emas. */
export function qoldi(n: Nishon, s: NishonSharoiti): number {
  return Math.max(0, n.chegara - joriy(n.tur, s));
}
