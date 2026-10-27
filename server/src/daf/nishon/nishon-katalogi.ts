/**
 * Nishonlar katalogi — BITTA joyda (spec S2 2.1, S3 §3). Jadvalda faqat
 * olingan nishon kaliti saqlanadi, shuning uchun yangi tur migratsiyasiz
 * qo'shiladi. Nomni mijoz kalitdan quradi; Telegram matni uchun server ham
 * quradi (`eslatma-matn.ts` `nishonNomi`, ikkalasi testda solishtiriladi).
 */
export type NishonTuri =
  | 'SERIE'
  | 'WOERTER'
  | 'LIGA'
  | 'XONA'
  | 'GURUH'
  | 'JANG';

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
  // S3: chegara — liga darajasi (`daf/liga/liga-qoidalari.ts`, 1 = Kumush).
  { key: 'LIGA_KUMUSH', tur: 'LIGA', chegara: 1 },
  { key: 'LIGA_OLTIN', tur: 'LIGA', chegara: 2 },
  { key: 'LIGA_YOQUT', tur: 'LIGA', chegara: 3 },
  { key: 'LIGA_OLMOS', tur: 'LIGA', chegara: 4 },
  // Kamida bitta xonada 1-o'rin, ≥ 50 ball, xonada ≥ 5 a'zo.
  { key: 'XONA_GOLIB', tur: 'XONA', chegara: 1 },
  // Guruhlar jadvalida 1-o'rin olgan haftada shu guruh uchun ≥ 1 ball.
  { key: 'GURUH_BIRINCHI', tur: 'GURUH', chegara: 1 },
  // Jang (spec 2026-10-27): chegara — g'alabalar soni. Liga balli bermaydi, shuning uchun nishon jangning o'z mukofoti.
  { key: 'JANG_10', tur: 'JANG', chegara: 10 },
  { key: 'JANG_50', tur: 'JANG', chegara: 50 },
  { key: 'JANG_100', tur: 'JANG', chegara: 100 },
];

/**
 * `serie` — joriy seriya (kun); `woerter` — kamida bir marta to'g'ri javob
 * berilgan so'zlar. S3 maydonlari ixtiyoriy: berilmasa shu nishonlar
 * sharti bajarilmagan hisoblanadi (S2 bir martalik skripti ularni bermaydi).
 */
export interface NishonSharoiti {
  serie: number;
  woerter: number;
  /** `DafStudentLeague.tier`, qator yo'q = 0. */
  liga?: number;
  xonaGolib?: boolean;
  guruhBirinchi?: boolean;
  /** Jang g'alabalari soni (`DafBattle.result = WIN`). */
  jangGolib?: number;
}

function joriy(tur: NishonTuri, s: NishonSharoiti): number {
  switch (tur) {
    case 'SERIE':
      return s.serie;
    case 'WOERTER':
      return s.woerter;
    case 'LIGA':
      return s.liga ?? 0;
    case 'XONA':
      return s.xonaGolib ? 1 : 0;
    case 'GURUH':
      return s.guruhBirinchi ? 1 : 0;
    case 'JANG':
      return s.jangGolib ?? 0;
  }
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
