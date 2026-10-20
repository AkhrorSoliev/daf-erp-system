import type { InlineKeyboardMarkup } from 'telegraf/types';
import { escapeHtml } from '../../telegram-groups/utils/format.util';
import {
  ENG_YUQORI_DARAJA,
  LIGA_NOMLARI,
  darajaNomi,
} from '../liga/liga-qoidalari';

/**
 * S4 xabar matnlari (spec S4 §1.2, §2, §3) — CEO o'z Telegram'ida ko'rgan
 * matnlar (`scripts/daf-eslatma-sinov.ts`); so'zini o'zgartirish CEO bilan.
 * Ohang: salom → sabab → yumshoq taklif → rahmat, jazo va aybdorlik yo'q.
 * `parse_mode: 'HTML'`: faqat ism escape qilinadi, qolgan matn qat'iy.
 */
export const ESLATMA_HAVOLA = 'https://student.dafzentrum.uz/portal/lernen';
/** Ism shundan uzun bo'lsa qisqartiriladi — xabar 4 096 belgidan oshmasin. */
export const ISM_CHEGARA = 64;
export const TOXTATISH_MATNI = "Eslatmalarni to'xtatish";
export const TOXTATILDI =
  "Eslatmalar to'xtatildi. Qayta yoqish: ilova → Darajam";
export const SIZGA_EMAS = 'Bu tugma sizga emas';
export const KEYINROQ = "Xatolik — birozdan keyin qayta urinib ko'ring";

const PREFIKS = 'dr:off:';
const INT4_MAX = 2_147_483_647;

function salom(ism: string): string {
  const toza = Array.from(ism.trim()).slice(0, ISM_CHEGARA).join('');
  return toza ? `Assalomu alaykum, ${escapeHtml(toza)}!` : 'Assalomu alaykum!';
}

export interface KechkiMalumot {
  ism: string;
  /** Kechagi kungacha uzluksiz mashq kunlari. */
  seriya: number;
  /** O'quvchining kunlik maqsadi (`MAQSAD_BALL`). */
  maqsadBall: number;
}

/**
 * Kechki eslatma (spec S4 §1.2). Seriya ≥ 2 bo'lsa seriyani saqlashga
 * chaqiradi, aks holda so'zlarni eslab qolishga. Bugun mashq qilmagani uchun
 * «hozir» doim 0 — matnda faqat maqsad aytiladi.
 */
export function kechkiMatn(k: KechkiMalumot): string {
  const taklif =
    k.seriya >= 2
      ? `Bugun hali mashq qilmadingiz — ${k.seriya} kunlik seriyangiz davom etishi uchun bitta qisqa seans yetadi (taxminan 5 daqiqa).`
      : "Nemis so'zlaringiz xotirada qolishi uchun bugun bir qisqa seans yetadi.";
  return `${salom(k.ism)} ${taklif} Bugungi maqsad: ${k.maqsadBall} ball. Davom etish: ${ESLATMA_HAVOLA} Rahmat!`;
}

export interface HaftalikMalumot {
  ism: string;
  ball: number;
  /** O'tgan hafta xonasi; xonada bo'lmagan bo'lsa `null` — qator chiqmaydi. */
  liga: { tier: number; orin: number; kotarildi: boolean } | null;
  /** Eng ko'p ball topgan guruhining o'rni; jadvalda bo'lmasa `null`. */
  guruh: { orin: number; jami: number } | null;
  /** O'tgan hafta olingan nishon kalitlari. */
  nishonlar: readonly string[];
}

/** Dushanba xulosasi (spec S4 §2): ball qatori doim, qolganlari ma'lumot bo'lsa. */
export function haftalikMatn(h: HaftalikMalumot): string {
  const q = [
    `${salom(h.ism)} O'tgan hafta natijalaringiz:`,
    `• Topilgan ball: ${h.ball}`,
  ];
  if (h.liga) {
    const tabrik =
      h.liga.kotarildi && h.liga.tier < ENG_YUQORI_DARAJA
        ? `. Tabriklaymiz, ${darajaNomi(h.liga.tier + 1)} ligasiga ko'tarildingiz!`
        : '';
    q.push(
      `• Liga: ${darajaNomi(h.liga.tier)}, xonada ${h.liga.orin}-o'rin${tabrik}`,
    );
  }
  if (h.guruh) {
    q.push(
      `• Guruhingiz: ${h.guruh.orin}-o'rin, jami ${h.guruh.jami} guruhdan`,
    );
  }
  if (h.nishonlar.length > 0) {
    q.push(`• Yangi nishonlar: ${h.nishonlar.map(nishonNomi).join(', ')}`);
  }
  q.push(`Yangi haftada omad! Davom etish: ${ESLATMA_HAVOLA}`);
  return q.join('\n');
}

/**
 * Nishon nomi kalitdan — mijozdagi `nishonNomi` (`client/.../lernen/nishon.ts`)
 * bilan bir xil natija (`eslatma-matn.spec.ts` ikkalasining misollarini
 * solishtiradi). Server ilgari nom bilmasdi: matn faqat mijozda edi.
 */
export function nishonNomi(key: string): string {
  const liga = /^LIGA_([A-Z]+)$/.exec(key);
  if (liga) {
    const nom = LIGA_NOMLARI.find((n) => n.toUpperCase() === liga[1]);
    return nom ? `${nom} ligasi` : escapeHtml(key);
  }
  if (key === 'XONA_GOLIB') return "Xona g'olibi";
  if (key === 'GURUH_BIRINCHI') return "Guruhlar jadvalida 1-o'rin";
  const m = /^(SERIE|WOERTER)_(\d+)$/.exec(key);
  if (!m) return escapeHtml(key);
  const n = Number(m[2]);
  if (m[1] === 'SERIE') return `${n} kun ketma-ket`;
  return n === 592 ? "A1 so'zlarining hammasi" : `${n} ta so'z`;
}

/**
 * Xabar tagidagi tugma: faqat SHU o'quvchi (ota-ona chati bir nechta bolani
 * ulashi mumkin). `callback_data` ≤ 64 bayt.
 */
export function toxtatishTugmasi(studentId: number): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: TOXTATISH_MATNI, callback_data: `${PREFIKS}${studentId}` }],
    ],
  };
}

/** `dr:off:<studentId>` → id; boshqa hamma narsa (0, int4 dan katta) `null`. */
export function toxtatishKimniki(data: string): number | null {
  const m = /^dr:off:([1-9]\d{0,9})$/.exec(data);
  if (!m) return null;
  const id = Number(m[1]);
  return id <= INT4_MAX ? id : null;
}
