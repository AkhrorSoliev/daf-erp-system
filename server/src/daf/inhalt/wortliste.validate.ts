import type { KursFile } from '../kurs/kurs.types';
import type { GoetheWort } from './goethe-parse';
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
 */
export function validateWortliste(
  file: WortlisteFile,
  kurs: KursFile,
  goethe: GoetheWort[],
): string[] {
  const problems: string[] = [];

  const known = new Set<string>();
  for (const s of kurs.units.flatMap((u) => u.sections)) known.add(s.code);

  const unitOfSection = new Map<string, string>();
  for (const u of kurs.units) {
    for (const s of u.sections) unitOfSection.set(s.code, u.code);
  }

  const goetheSet = new Set(goethe.map((g) => g.wort.toLowerCase()));

  const bySection = new Map<string, number>();
  const byUnit = new Map<string, number>();
  const seen = new Map<string, string>();

  for (const e of file.eintraege) {
    if (!known.has(e.section)) {
      problems.push(`${e.wort}: xaritada yo\`q bo\`lim — ${e.section}`);
      continue;
    }

    const prev = seen.get(e.wort.toLowerCase());
    if (prev !== undefined) {
      problems.push(`${e.wort}: ikki joyda — ${prev} va ${e.section}`);
    } else {
      seen.set(e.wort.toLowerCase(), e.section);
    }

    if (!goetheSet.has(e.wort.toLowerCase()) && (e.grund ?? '').trim() === '') {
      problems.push(`${e.wort}: Goethe ro\`yxatida yo\`q va sababi yozilmagan`);
    }

    bySection.set(e.section, (bySection.get(e.section) ?? 0) + 1);
    const unit = unitOfSection.get(e.section);
    if (unit !== undefined) byUnit.set(unit, (byUnit.get(unit) ?? 0) + 1);
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
