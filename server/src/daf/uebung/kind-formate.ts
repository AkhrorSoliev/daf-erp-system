import type { FrageFormat } from './frage.types';

/**
 * Seans turining «ta'mi» — QAT'IY BO'LINISH EMAS, MOYILLIK.
 *
 * NEGA QAT'IY EMAS (arifmetika). Kurs dizayni 16 format uchun yozilgan.
 * Bugun 10 tasi bor, va «Tanishuv» ga tegishlisi uchtasi. Qat'iy
 * bo'linsa, seansda 3 xil format qolardi — `seans.ts` ning o'z qoidasi
 * esa kamida `MIN_FORMATE` (5) talab qiladi. Ikki qoida bir-birini
 * inkor qilardi.
 *
 * Shuning uchun bu ro'yxat faqat TARTIBGA ta'sir qiladi: mos formatlar
 * oldinga suriladi, yetmasa qolganidan olinadi. Formatlar 16 taga
 * yetganda moyillik o'z-o'zidan qat'iy bo'linishga aylanadi va bu kodni
 * o'zgartirish shart bo'lmaydi.
 *
 * `BRIDGE` da moyillik ATAYLAB yo'q: o'tish sinovi aralash bo'lishi
 * kerak (kurs dizayni 3-bo'lim).
 */
const XARITA: Record<string, FrageFormat[]> = {
  SECTION_A: ['WORT_UZ', 'PAAR', 'ZUORDNEN'],
  SECTION_B: ['UZ_WORT', 'ARTIKEL', 'LUECKE', 'SATZ_BAUEN'],
  BRIDGE: [],
  UNIT_TEST: ['REAKTION', 'ZUORDNEN', 'DIALOG_LUECKE', 'SATZ_UEBERSETZEN'],
};

export function bevorzugteFormate(kind: string | null): FrageFormat[] {
  if (!kind) return [];
  return XARITA[kind] ?? [];
}
