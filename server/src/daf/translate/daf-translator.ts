import type { TranslateModel } from './translate-model';

export interface TranslatableItem {
  /** Nemischa asl matn — tarjimaning ASOSIY manbasi. */
  de: string;
  /** Inglizcha izoh — faqat ma'noni ANIQLASHTIRISH uchun. */
  en: string;
}

export interface TranslatedItem extends TranslatableItem {
  uz: string;
}

export class TranslationCountMismatchError extends Error {
  constructor(expected: number, got: number) {
    super(
      `Tarjimalar soni mos kelmadi: ${expected} ta so'raldi, ${got} ta qaytdi`,
    );
    this.name = 'TranslationCountMismatchError';
  }
}

/**
 * Nemischa matnni o'zbekchaga o'giradi.
 *
 * So'rovga nemischa VA inglizcha matn birga yuboriladi, lekin tarjima
 * nemischadan qilinadi: inglizcha izohning o'zi allaqachon tarjima, faqat
 * undan o'girish xatolarni ko'paytiradi. Inglizcha ma'noni aniqlashtirish
 * uchun kerak — `Bank` ni «o'rindiq» yoki «bank» deb o'girish shu izohga
 * qarab hal bo'ladi.
 *
 * Qaytgan tarjimalar soni so'ralgan songa TENG bo'lishi shart. Teng
 * bo'lmasa, tarjimalar bir pozitsiyaga siljib, har biri boshqa so'zga
 * tushadi — va bu xato ko'rinmaydi: har so'z tarjimali bo'lib turadi.
 */
export function buildPrompt(items: TranslatableItem[]): string {
  const lines = items
    .map((it, i) => `${i + 1}. ${it.de}  [en: ${it.en}]`)
    .join('\n');

  return [
    "Siz nemis tilidan o'zbek tiliga tarjima qilasiz.",
    '',
    'Qoidalar:',
    "- Tarjima NEMISCHA matndan qilinadi. Inglizcha izoh faqat ma'noni",
    '  aniqlashtirish uchun berilgan.',
    "- Faqat lotin alifbosidagi o'zbek tili. Kirill yoki arab harflari",
    '  ishlatilmaydi.',
    "- Har qatorga bitta tarjima. Izoh, sharh yoki qo'shimcha matn yo'q.",
    '- Javob JSON massiv bo\'lsin: ["tarjima 1", "tarjima 2", ...]',
    `- Massivda ANIQ ${items.length} ta element bo'lishi shart.`,
    '',
    'Matnlar:',
    lines,
  ].join('\n');
}

/** Model javobidan JSON massivni ajratadi (u ba'zan ` ``` ` ichida keladi). */
export function parseTranslations(raw: string): string[] {
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('Model javobida JSON massiv topilmadi');
  }

  const parsed: unknown = JSON.parse(raw.slice(start, end + 1));
  if (!Array.isArray(parsed) || parsed.some((x) => typeof x !== 'string')) {
    throw new Error('Model javobi satrlar massivi emas');
  }
  return parsed as string[];
}

export async function translateBatch(
  items: TranslatableItem[],
  model: TranslateModel,
): Promise<TranslatedItem[]> {
  if (items.length === 0) return [];

  const out = parseTranslations(await model.complete(buildPrompt(items)));
  if (out.length !== items.length) {
    throw new TranslationCountMismatchError(items.length, out.length);
  }

  // Asl nemischa va inglizcha matn SAQLANADI — tarjima qayta ko'rilganda
  // solishtirish uchun kerak, va tarjima ustiga yozilsa asl matn butunlay
  // yo'qolardi.
  return items.map((it, i) => ({ ...it, uz: out[i].trim() }));
}
