import type { KursFile } from '../kurs/kurs.types';
import type { GoetheFile } from './goethe-parse';
import { isWordInGoetheA1 } from './goethe-parse';
import type { WortlisteFile } from './wortliste.types';

export const WORDS_MIN = 8;
export const WORDS_MAX = 12;
export const UNIT_WORDS_MAX = 50;

/**
 * So'z taqsimotini tekshiradi.
 *
 * BOSHLANGAN bo'limgagina hajm qoidasi qo'llanadi: fayl bosqichma-bosqich
 * to'ladi, va hali yozilmagan bo'limni «bo'sh» deb aybdor qilish butun
 * faylni 12 unit tugagunga qadar qizil holatda ushlab turardi.
 *
 * Uchinchi argument BUTUN `GoetheFile`ni oladi (nafaqat alifbohla
 * ro'yxatni) — Goethe-tegishlilik `isWordInGoetheA1` orqali tekshiriladi,
 * shu bilan yopiq guruhlar (sonlar, hafta kunlari, ...) ham, ularning
 * raqam ko'rinishlari ham bir joyda, bir xil qoida bilan hisobga olinadi.
 * Har bir chaqiruv nuqtasi endi shunchaki `goethe`ni butunligicha uzatadi —
 * "sonlarni qanday tekshirish kerak" degan bilim faqat shu yerda va
 * `isWordInGoetheA1`da yashaydi, chaqiruv nuqtalarida takrorlanmaydi.
 */
export function validateWortliste(
  file: WortlisteFile,
  kurs: KursFile,
  goethe: GoetheFile,
): string[] {
  const problems: string[] = [];

  const unitOfSection = new Map<string, string>();
  for (const u of kurs.units) {
    for (const s of u.sections) unitOfSection.set(s.code, u.code);
  }

  const bySection = new Map<string, number>();
  const byUnit = new Map<string, number>();
  const seen = new Map<string, string>();

  for (const e of file.eintraege) {
    const isKnownSection = unitOfSection.has(e.section);

    if (!isKnownSection) {
      problems.push(`${e.wort}: xaritada yo\`q bo\`lim — ${e.section}`);
    }

    const prev = seen.get(e.wort.toLowerCase());
    if (prev !== undefined) {
      problems.push(`${e.wort}: ikki joyda — ${prev} va ${e.section}`);
    } else {
      seen.set(e.wort.toLowerCase(), e.section);
    }

    if (!isWordInGoetheA1(e.wort, goethe) && (e.grund ?? '').trim() === '') {
      problems.push(`${e.wort}: Goethe ro\`yxatida yo\`q va sababi yozilmagan`);
    }

    // Only count words in known sections
    if (isKnownSection) {
      bySection.set(e.section, (bySection.get(e.section) ?? 0) + 1);
      const unit = unitOfSection.get(e.section);
      if (unit !== undefined) byUnit.set(unit, (byUnit.get(unit) ?? 0) + 1);
    }
  }

  for (const [code, n] of bySection) {
    if (n < WORDS_MIN || n > WORDS_MAX) {
      problems.push(`${code}: ${n} so\`z — ${WORDS_MIN}–${WORDS_MAX} bo\`lishi kerak`);
    }
  }

  for (const [code, n] of byUnit) {
    if (n > UNIT_WORDS_MAX) {
      problems.push(`${code}: jami ${n} so\`z — ${UNIT_WORDS_MAX} so\`zdan ko\`p`);
    }
  }

  return problems;
}
