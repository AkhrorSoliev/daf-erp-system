import {
  TASHKENT_OFFSET_MS,
  addDaysToDateStr,
} from '../../common/date/tashkent';

/**
 * Kechki eslatma va dushanba xulosasi qoidalari — BITTA joyda (spec S4 §1.1,
 * §2, §4, §5; ADR-0117). Hammasi sof funksiya: baza va soat yo'q. SQL
 * (`eslatma-auditoriya.ts`) shu qoidalarning tez shakli; yuklama skripti
 * (`scripts/load/daf-yuklama-s4-paritet.ts`) SQL natijasini shu funksiyalar
 * bilan brute force solishtiradi — qoida o'zgarsa ikkalasi birga.
 *
 * Sanalar — Toshkent kuni matni `YYYY-MM-DD`, matn sifatida taqqoslanadi.
 */

/** Oxirgi necha kunda (bugungidan tashqari) mashq bo'lishi kerak. */
export const ESLATMA_OYNA_KUN = 14;
/** 7 kunlik oynada ko'pi bilan nechta kechki eslatma (faqat `SENT`). */
export const HAFTALIK_CHEGARA = 4;
export const CHEGARA_OYNA_KUN = 7;
/** Xabarlar orasidagi pauza: Telegram ≈ 30/s chegarasidan ancha past. */
export const PAUZA_MS = 60;
/** Jurnal qatorlari shuncha kundan keyin o'chiriladi. */
export const JURNAL_SAQLASH_KUN = 90;
/** Dushanba xulosasining oxirgi urinish soati (Toshkent). */
export const OXIRGI_URINISH_SOATI = 18;

export type EslatmaRejimi = 'off' | 'log' | 'on';
export type EslatmaTuri = 'EVENING' | 'WEEKLY';
export type EslatmaHolati = 'SENT' | 'FAILED';

/** `DAF_ESLATMALAR`: noma'lum yoki bo'sh qiymat — `off` (xavfsiz tomon). */
export function eslatmaRejimi(raw: string | undefined): EslatmaRejimi {
  const v = (raw ?? '').trim().toLowerCase();
  return v === 'on' || v === 'log' ? v : 'off';
}

export interface KechkiSanalar {
  bugun: string;
  kecha: string;
  /** 14 kunlik oyna `[oynaBoshi, bugun)` — bugungidan tashqari. */
  oynaBoshi: string;
  /** 7 kunlik chegara oynasi `[chegaraBoshi, bugun]` — bugun bilan 7 kun. */
  chegaraBoshi: string;
}

export function kechkiSanalar(bugun: string): KechkiSanalar {
  return {
    bugun,
    kecha: addDaysToDateStr(bugun, -1),
    oynaBoshi: addDaysToDateStr(bugun, -ESLATMA_OYNA_KUN),
    chegaraBoshi: addDaysToDateStr(bugun, -(CHEGARA_OYNA_KUN - 1)),
  };
}

export interface JurnalYozuvi {
  kind: EslatmaTuri;
  sentOn: string;
  status: EslatmaHolati;
}

/** Ikkala tur uchun umumiy faktlar (spec S4 §1.1 birinchi ikki qator, §2). */
export interface OquvchiFakti {
  ochirilgan: boolean;
  chatId: string | null;
  uzilgan: boolean;
  /** `DafStudentSetting.remindersEnabled`, qator yo'q = `true`. */
  eslatmalar: boolean;
  jurnal: readonly JurnalYozuvi[];
}

export interface KechkiFakt extends OquvchiFakti {
  /** `DafStudentDay` qatori bor kunlar (har qanday ball bilan). */
  kunlar: readonly string[];
}

export interface HaftalikFakt extends OquvchiFakti {
  /** O'tgan hafta (dushanba–yakshanba) `DafStudentDay.points` yig'indisi. */
  otganHaftaBall: number;
}

/**
 * ADR-0066 oddiy xabarni uzilgan chatga ham yuborishni talab qiladi — bu
 * muhim xabarlar uchun. Eslatma muhim emas: uzilgan chat o'tkazib yuboriladi
 * (ketma-ket 403 yo'q, ADR-0117).
 */
function yetibBoradimi(f: OquvchiFakti): boolean {
  return !f.ochirilgan && f.chatId !== null && !f.uzilgan && f.eslatmalar;
}

const yuborilgan = (j: JurnalYozuvi) => j.status === 'SENT';

/**
 * Kechki eslatma kimga (spec S4 §1.1). `FAILED` hech qaysi shartga
 * sanalmaydi (yetib bormagan xabar «oldi» emas), lekin shu kun uchun
 * egallangan qator — har qanday holatda — qayta yubormaydi (§4: «`FAILED`
 * qayta urinilmaydi»).
 */
export function kechkiNomzodmi(f: KechkiFakt, bugun: string): boolean {
  if (!yetibBoradimi(f)) return false;
  const s = kechkiSanalar(bugun);
  if (f.kunlar.includes(bugun)) return false;
  if (!f.kunlar.some((d) => d >= s.oynaBoshi && d < bugun)) return false;
  const kechkilar = f.jurnal.filter((j) => j.kind === 'EVENING');
  if (kechkilar.some((j) => j.sentOn === bugun)) return false;
  if (kechkilar.some((j) => yuborilgan(j) && j.sentOn === s.kecha))
    return false;
  const oynada = kechkilar.filter(
    (j) => yuborilgan(j) && j.sentOn >= s.chegaraBoshi && j.sentOn < bugun,
  );
  if (oynada.length >= HAFTALIK_CHEGARA) return false;
  return !f.jurnal.some(
    (j) => j.kind === 'WEEKLY' && yuborilgan(j) && j.sentOn === bugun,
  );
}

/** Dushanba xulosasi kimga (spec S4 §2). `bugun` — dushanba. */
export function haftalikNomzodmi(f: HaftalikFakt, bugun: string): boolean {
  if (!yetibBoradimi(f) || f.otganHaftaBall < 1) return false;
  return !f.jurnal.some((j) => j.kind === 'WEEKLY' && j.sentOn === bugun);
}

/** O'tgan hafta `[otgan, bugun)`; `bugun` — joriy haftaning dushanbasi. */
export function otganHafta(bugun: string): { otgan: string; bugun: string } {
  return { otgan: addDaysToDateStr(bugun, -7), bugun };
}

export type HaftalikQaror = 'yubor' | 'kut' | 'tashla';

/**
 * Tayyorlik (spec S4 §2): hafta hisoblangan bo'lsa yuboriladi; aks holda
 * 18:00 gacha keyingi soatda qayta urinish, 18:00 da ham tayyor bo'lmasa —
 * shu hafta yuborilmaydi.
 */
export function haftalikQaror(soat: number, tayyor: boolean): HaftalikQaror {
  if (tayyor) return 'yubor';
  return soat >= OXIRGI_URINISH_SOATI ? 'tashla' : 'kut';
}

export function toshkentSoati(now: Date): number {
  return new Date(now.getTime() + TASHKENT_OFFSET_MS).getUTCHours();
}

/** Jurnalning shu kundan oldingi qatorlari o'chiriladi. */
export function tozalashChegarasi(bugun: string): string {
  return addDaysToDateStr(bugun, -JURNAL_SAQLASH_KUN);
}
