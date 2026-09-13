import type { FrageFormat } from './frage.types';

/**
 * Goethe ko'nikmasi. TypeScript tipi, baza enum'i EMAS: ko'nikma bazada
 * saqlanmaydi, o'qish paytida `format`dan hisoblanadi. Sabab: xarita
 * o'zgarsa (o'qituvchilar «artikl baribir grammatika» desa) bitta qator
 * o'zgaradi va ESKI natijalar ham yangi xarita bo'yicha ko'rinadi.
 */
export type DafSkill =
  | 'WORTSCHATZ'
  | 'GRAMMATIK'
  | 'HOEREN'
  | 'LESEN'
  | 'SCHREIBEN'
  | 'SPRECHEN';

/**
 * Jonli formatlar. `Record<FrageFormat, …>` — union'ga format qo'shilib,
 * bu yerga yozilmasa `npm run typecheck` yiqiladi (`uebung.dto.ts` dagi
 * `ALLE_FRAGE_FORMATLAR` bilan bir xil usul).
 *
 * Qoida (CEO, 13.09.2026): ko'nikma o'quvchi mashqda AMALDA nima
 * qilayotganiga qarab, mashq kelajakda nimaga tayyorlashiga qarab emas.
 * So'z/tayyor iborani taniydi — Wortschatz; gap tuzilishi — Grammatik;
 * gap yoki suhbatni o'qib tushunadi — Lesen; eshitadi — Hören; o'zi
 * yozadi — Schreiben; o'zi gapiradi — Sprechen (hozir format yo'q).
 */
export const FORMAT_SKILL: Record<FrageFormat, DafSkill> = {
  WORT_UZ: 'WORTSCHATZ',
  UZ_WORT: 'WORTSCHATZ',
  PAAR: 'WORTSCHATZ',
  // Artikl so'z bilan birga yodlanadi; xato — «so'zni to'liq bilmaydi».
  ARTIKEL: 'WORTSCHATZ',
  // Tayyor iborani tanlash. Sprechen EMAS: o'quvchi gapirmaydi —
  // «Gapirish 90%» o'qituvchini chalg'itardi.
  REAKTION: 'WORTSCHATZ',
  ZUORDNEN: 'WORTSCHATZ',
  LUECKE: 'GRAMMATIK',
  SATZ_BAUEN: 'GRAMMATIK',
  // Gap yoki suhbatni butunligicha tushunish.
  SATZ_UEBERSETZEN: 'LESEN',
  DIALOG_LUECKE: 'LESEN',
  AUDIO_WORT: 'HOEREN',
  WORT_TIPPEN: 'SCHREIBEN',
};

/**
 * Nafaqadagi formatlar. `DafAttempt.format` matn bo'lgani uchun o'chirilgan
 * format tarixda qoladi — bu yerda uning ko'nikmasi ham qoladi, aks holda
 * eski urinishlar «noma'lum»ga tushardi. Format `FrageFormat` dan
 * olib tashlanganda uni SHU YERGA ko'chiring, o'chirmang.
 */
export const NAFAQADAGI_FORMAT_SKILL: Record<string, DafSkill> = {};

export function skillFuer(
  format: string | null | undefined,
): DafSkill | null {
  if (!format) return null;
  if (format in FORMAT_SKILL) return FORMAT_SKILL[format as FrageFormat];
  return NAFAQADAGI_FORMAT_SKILL[format] ?? null;
}
