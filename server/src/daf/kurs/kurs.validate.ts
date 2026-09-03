import type { KursFile } from './kurs.types';

export const UNIT_COUNT = 12;
export const SECTION_COUNT = 64;
export const SECTIONS_MIN = 5;
export const SECTIONS_MAX = 6;
export const WORDS_MIN = 8;
export const WORDS_MAX = 12;
export const UNIT_WORDS_MAX = 50;

/**
 * Xaritani tekshiradi va muammolar ro'yxatini qaytaradi.
 *
 * Birinchi muammoda YIQILMAYDI — hammasini bir yo'la ko'rsatadi.
 * Bittalab yiqilish 64 bo'limli faylni tuzatishni o'nlab yugurishga
 * aylantirardi.
 */
export function validateKurs(file: KursFile): string[] {
  const problems: string[] = [];

  if (file.level !== 'A1') {
    problems.push(`Daraja A1 bo'lishi kerak, fayl: ${String(file.level)}`);
  }

  if (file.units.length !== UNIT_COUNT) {
    problems.push(
      `${UNIT_COUNT} ta unit bo'lishi kerak, faylda: ${file.units.length}`,
    );
  }

  const orders = file.units.map((u) => u.order);
  const expected = file.units.map((_, i) => i + 1);
  if (orders.join(',') !== expected.join(',')) {
    problems.push(`Unit tartibi uzluksiz emas: ${orders.join(', ')}`);
  }

  const unitCodes = new Set<string>();
  const sectionCodes = new Set<string>();
  let sectionTotal = 0;

  for (const u of file.units) {
    if (unitCodes.has(u.code)) {
      problems.push(`takrorlangan unit kaliti: ${u.code}`);
    }
    unitCodes.add(u.code);

    const wantCode = `u${String(u.order).padStart(2, '0')}`;
    if (u.code !== wantCode) {
      problems.push(`${u.order}-unit kaliti ${wantCode} bo\`lishi kerak: ${u.code}`);
    }
    if (u.titleDe.trim() === '' || u.titleUz.trim() === '') {
      problems.push(`${u.code}: unit sarlavhasi bo\`sh`);
    }
    if (u.theme.trim() === '') {
      problems.push(`${u.code}: unit mavzusi bo\`sh`);
    }

    const n = u.sections.length;
    sectionTotal += n;
    if (n < SECTIONS_MIN || n > SECTIONS_MAX) {
      problems.push(
        `${u.code}: ${n} ta bo\`lim — ${SECTIONS_MIN}–${SECTIONS_MAX} bo\`lim bo\`lishi kerak`,
      );
    }

    const sOrders = u.sections.map((s) => s.order);
    const sExpected = u.sections.map((_, i) => i + 1);
    if (sOrders.join(',') !== sExpected.join(',')) {
      problems.push(`${u.code}: bo\`lim tartibi uzluksiz emas: ${sOrders.join(', ')}`);
    }

    let words = 0;
    for (const s of u.sections) {
      if (sectionCodes.has(s.code)) {
        problems.push(`takrorlangan bo\`lim kaliti: ${s.code}`);
      }
      sectionCodes.add(s.code);

      if (!s.code.startsWith(`${u.code}-s`)) {
        problems.push(`${s.code}: kaliti unitga mos emas (${u.code} kutilgan)`);
      }
      if (s.titleDe.trim() === '' || s.titleUz.trim() === '') {
        problems.push(`${s.code}: sarlavhasi bo\`sh`);
      }
      if (s.grammar.trim() === '' || s.grammarUz.trim() === '') {
        problems.push(`${s.code}: grammatikasi bo\`sh`);
      }
      if (s.wordBudget < WORDS_MIN || s.wordBudget > WORDS_MAX) {
        problems.push(
          `${s.code}: ${s.wordBudget} so\`z — ${WORDS_MIN}–${WORDS_MAX} so\`z bo\`lishi kerak`,
        );
      }
      words += s.wordBudget;
    }

    if (words > UNIT_WORDS_MAX) {
      problems.push(`${u.code}: jami ${words} so\`z — ${UNIT_WORDS_MAX} so\`zdan ko\`p`);
    }
  }

  if (sectionTotal !== SECTION_COUNT) {
    problems.push(
      `Jami ${SECTION_COUNT} ta bo\`lim bo\`lishi kerak, faylda: ${sectionTotal}`,
    );
  }

  return problems;
}
