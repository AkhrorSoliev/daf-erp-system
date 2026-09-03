import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateA1Units } from './a1-units.validate';
import type { A1UnitsFile } from './a1-units.types';

/**
 * Qolgan 9 test sun'iy ma'lumotda ishlaydi — ular funksiyaning o'zini
 * qo'riqlaydi. Bu esa HAQIQIY ikki faylni bir-biriga qarshi tekshiradi.
 *
 * Ansiz `a1-units.json` ni `dib.json` ga solishtirish faqat qo'lda
 * yugurtiriladigan buyruq bo'lib qolardi: `daf-harvest.ts` manbani qayta
 * yig'sa yoki kimdir bo'limni tahrirlasa, CI jim qolardi va yo'qolgan
 * kontent faqat o'quvchida ko'rinardi.
 */
const CONTENT = join(__dirname, '..', '..', '..', 'content', 'daf');

interface DibSection {
  id: string;
  chapter: number;
  entries?: unknown[];
}
interface Dib {
  sections: DibSection[];
  grammar: { code: string }[];
}

function read<T>(name: string): T {
  return JSON.parse(readFileSync(join(CONTENT, name), 'utf8')) as T;
}

describe('a1-units.json manbaga mos keladi', () => {
  it('validator hech qanday muammo topmaydi', () => {
    const dib = read<Dib>('dib.json');
    const file = read<A1UnitsFile>('a1-units.json');

    // A1 = 1–4-boblar. Bu chegara 1-taskdagi daraja xaritasidan keladi.
    const a1Sections = dib.sections.filter((s) => s.chapter <= 4);
    const sizes = new Map(
      a1Sections.map((s) => [s.id, (s.entries ?? []).length] as const),
    );

    expect(
      validateA1Units(
        file,
        sizes,
        a1Sections.map((s) => s.id),
        dib.grammar.map((g) => g.code),
      ),
    ).toEqual([]);
  });
});
