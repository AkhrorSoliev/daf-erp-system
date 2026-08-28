import type { A1UnitsFile } from './a1-units.types';

export const MIN_WORDS = 30;
export const MAX_WORDS = 50;

/**
 * Bo'lim faylini tekshiradi va muammolar ro'yxatini qaytaradi.
 *
 * Muammo topilsa YIQILMAYDI, ro'yxat qaytaradi — chaqiruvchi hammasini
 * bir yo'la ko'rsatishi uchun. Bittalab yiqilish faylni tuzatishni
 * o'nlab yugurishga aylantirardi.
 */
export function validateA1Units(
  file: A1UnitsFile,
  sectionSizes: Map<string, number>,
  allSections: string[],
): string[] {
  const problems: string[] = [];
  const seen = new Map<string, number>();

  for (const u of file.units) {
    for (const s of u.sections) {
      if (!sectionSizes.has(s)) {
        problems.push(`Manbada yo'q mavzu: ${s} (${u.order}-bo'lim)`);
        continue;
      }
      seen.set(s, (seen.get(s) ?? 0) + 1);
    }

    const words = u.sections.reduce(
      (n, s) => n + (sectionSizes.get(s) ?? 0),
      0,
    );
    if (words < MIN_WORDS) {
      problems.push(`${u.order}-bo'lim: ${words} so'z — ${MIN_WORDS} dan kam`);
    }
    if (words > MAX_WORDS) {
      problems.push(`${u.order}-bo'lim: ${words} so'z — ${MAX_WORDS} dan ko'p`);
    }
  }

  const dup = [...seen].filter(([, n]) => n > 1).map(([s]) => s);
  if (dup.length > 0) {
    problems.push(`Bir necha bo'limda takrorlangan mavzu: ${dup.join(', ')}`);
  }

  const untouched = allSections.filter((s) => !seen.has(s));
  if (untouched.length > 0) {
    problems.push(`Hech bir bo'limga tegmagan mavzu: ${untouched.join(', ')}`);
  }

  const orders = file.units.map((u) => u.order);
  const expected = orders.map((_, i) => i + 1);
  if (orders.join(',') !== expected.join(',')) {
    problems.push(`Tartib raqamlari uzluksiz emas: ${orders.join(', ')}`);
  }

  return problems;
}
