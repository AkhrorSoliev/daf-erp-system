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
  SECTION_A: ['WORT_UZ', 'PAAR', 'ZUORDNEN', 'AUDIO_WORT'],
  SECTION_B: ['UZ_WORT', 'ARTIKEL', 'LUECKE', 'SATZ_BAUEN', 'WORT_TIPPEN'],
  BRIDGE: [],
  // BUGUN O'LIK: `UNIT_TEST` darsi `kurs-lessons.ts`da HAR DOIM
  // bo'limsiz yaratiladi (`push('UNIT_TEST', null, ...)`), dvigatel esa
  // bo'limi yo'q dars uchun umuman seans QURMAYDI (`UebungService`
  // bunday darsda `null` qaytaradi) — mijoz eski dars sahifasiga
  // tushadi, bu XARITAga hech qachon murojaat qilinmaydi. Shuning uchun
  // `HOEREN_WAHL` bugun faqat `SECTION_A`/`SECTION_B`/`BRIDGE`
  // seanslarida (moyilliksiz, oddiy nomzod sifatida) chiqadi. Yozuv
  // o'chirilmaydi — yakuniy sinov dvigatelga ulanganda (alohida ish)
  // bu moyillik shu zahoti kuchga kiradi.
  UNIT_TEST: [
    'REAKTION',
    'ZUORDNEN',
    'DIALOG_LUECKE',
    'SATZ_UEBERSETZEN',
    'HOEREN_WAHL',
  ],
};

export function bevorzugteFormate(kind: string | null): FrageFormat[] {
  if (!kind) return [];
  return XARITA[kind] ?? [];
}
