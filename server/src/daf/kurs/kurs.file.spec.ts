import { readFileSync } from 'fs';
import { join } from 'path';
import { validateKurs, SECTION_COUNT, UNIT_COUNT } from './kurs.validate';
import type { KursFile } from './kurs.types';

/**
 * Haqiqiy xarita faylini qo'riqlaydi. Validator o'zi to'g'ri ishlashi
 * yetarli emas — fayl unga MOS ekani ham har yugurishda tekshiriladi,
 * aks holda qo'lda tahrir jimgina buzib ketadi.
 */
describe('kurs.json', () => {
  const file = JSON.parse(
    readFileSync(
      join(__dirname, '..', '..', '..', 'content', 'daf', 'a1', 'kurs.json'),
      'utf8',
    ),
  ) as KursFile;

  it('validatordan o`tadi', () => {
    expect(validateKurs(file)).toEqual([]);
  });

  it('12 unit va 64 bo`limdan iborat', () => {
    expect(file.units).toHaveLength(UNIT_COUNT);
    const sections = file.units.reduce((n, u) => n + u.sections.length, 0);
    expect(sections).toBe(SECTION_COUNT);
  });
});
