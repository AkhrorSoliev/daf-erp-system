/**
 * Jang qoidalari — BITTA joyda (spec 2026-10-27 §2, §6). Raqamlar CEO
 * qarorlari: o'zgartirish spec bilan birga bo'ladi.
 */

export const SAVOL_SONI = 6;
export const SAVOL_MS = 10_000;
/** Tarmoq kechikishi: telefon javobi serverga 10 s dan keyin yetib kelishi mumkin. */
export const KECHIKISH_MS = 2_000;
/** Raqib kartasi ko'rinadigan vaqt — birinchi savol vaqti shundan keyin boshlanadi. */
export const KIRISH_MS = 3_000;
/**
 * Javob qabul qilingach mijoz to'g'ri/xato kartasini shuncha ko'rsatadi va
 * keyin keyingi savolni ochib, 10 s taymerni boshlaydi. Server keyingi savol
 * vaqtini shundan boshlaydi, aks holda o'yinchining ekranidan ~1,5 s oldinda
 * yurib, KECHIKISH_MS ni yeb qo'yadi va `ms` ni oshirib yuboradi.
 * MIJOZDAGI JAVOB_KORISH_MS (client/.../lernen/jang/jang-holati.ts) BILAN BIR XIL BO'LISHI SHART.
 */
export const JAVOB_KORISH_MS = 1_500;
export const KUNLIK_CHEGARA = 5;
export const TASHLANGAN_MS = 60_000;
export const YANGI_TOPLAM_HAR = 3;
export const KUCH_STANDART = 0.6;
export const KUCH_ORALIQ = 0.15;
export const KUCH_MIN_JANG = 3;
export const KUCH_OYNA = 10;
export const UCHRASHMASLIK_KUN = 7;
export const KORILGAN_KUN = 3;
/** Ruh nomzodlari va «oxirgi ko'rilgan» tarixi shu oynadan olinadi. */
export const TARIX_KUN = 30;
// ponytail: 300 ta eng yangi ruh nomzodi; markaz o'ssa SQL filtrga o'tkaziladi.
export const RUH_NOMZOD_LIMIT = 300;
export const DAFI_BOT_ISMI = 'Dafi bot';

export type Natija = 'WIN' | 'LOSS' | 'DRAW';

interface Hisob {
  togri: number;
  ms: number;
}

export function jangNatijasi(men: Hisob, raqib: Hisob): Natija {
  if (men.togri !== raqib.togri)
    return men.togri > raqib.togri ? 'WIN' : 'LOSS';
  if (men.ms !== raqib.ms) return men.ms < raqib.ms ? 'WIN' : 'LOSS';
  return 'DRAW';
}

/**
 * Nega har 3-jang: yangi savollar faqat bot janglarida tanlanadi, ruh
 * janglari eski to'plamni takrorlaydi — bu qoidasiz ruh ko'paygan sari bir
 * xil to'plamlar aylanib qoladi (spec §6).
 */
export function yangiToplamNavbati(oldingiJanglar: number): boolean {
  return (oldingiJanglar + 1) % YANGI_TOPLAM_HAR === 0;
}

/** `togriSonlari` — `DONE` janglar, eng yangisi birinchi. */
export function kuch(togriSonlari: number[]): number {
  if (togriSonlari.length < KUCH_MIN_JANG) return KUCH_STANDART;
  const oyna = togriSonlari.slice(0, KUCH_OYNA);
  return oyna.reduce((s, x) => s + x, 0) / (oyna.length * SAVOL_SONI);
}

/** Boshidagi ketma-ket g'alabalar; durang ham seriyani uzadi. */
export function seriya(natijalar: Natija[]): number {
  let n = 0;
  for (const x of natijalar) {
    if (x !== 'WIN') break;
    n += 1;
  }
  return n;
}

export function raqibIsmi(s: { firstName: string; lastName: string }): string {
  const bosh = s.lastName.trim().charAt(0).toUpperCase();
  return bosh ? `${s.firstName} ${bosh}.` : s.firstName;
}

/**
 * `DAF_JANG`: `on` — hammaga; `7,12` — faqat shu o'quvchilarga (CEO yoqishdan
 * oldin o'zi sinaydi); qolgan hamma narsa — o'chiq (xavfsiz tomon).
 */
export function jangYoqilganmi(
  qiymat: string | undefined,
  studentId: number,
): boolean {
  const v = (qiymat ?? '').trim();
  if (v === 'on') return true;
  if (!/^\d+(\s*,\s*\d+)*$/.test(v)) return false;
  return v
    .split(',')
    .map((s) => Number(s.trim()))
    .includes(studentId);
}

/** Unit o'tilgan = uning HAMMA darsi tugagan (spec §4). */
export function otilganUnitlar(
  darslar: { unitId: number; tugagan: boolean }[],
): number[] {
  const holat = new Map<number, boolean>();
  for (const d of darslar)
    holat.set(d.unitId, (holat.get(d.unitId) ?? true) && d.tugagan);
  return [...holat].filter(([, ok]) => ok).map(([id]) => id);
}

export function kunOldin(hozir: Date, kun: number): Date {
  return new Date(hozir.getTime() - kun * 86_400_000);
}
