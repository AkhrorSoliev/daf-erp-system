/**
 * A1 xaritasini tekshiradi.
 *
 *   npm run daf:a1-check
 *
 * Muammo topilsa 1 kod bilan chiqadi — CI va qo'lda yugurishda bir xil
 * ishlaydi. Ro'yxat to'liq chiqadi, birinchi muammoda to'xtamaydi.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { validateKurs } from '../src/daf/kurs/kurs.validate';
import type { KursFile } from '../src/daf/kurs/kurs.types';

const PATH = join(__dirname, '..', 'content', 'daf', 'a1', 'kurs.json');

function main(): void {
  const file = JSON.parse(readFileSync(PATH, 'utf8')) as KursFile;
  const problems = validateKurs(file);

  if (problems.length > 0) {
    console.error(`${problems.length} ta muammo:`);
    problems.forEach((p) => console.error(`  - ${p}`));
    process.exit(1);
  }

  const sections = file.units.reduce((n, u) => n + u.sections.length, 0);
  const words = file.units.reduce(
    (n, u) => n + u.sections.reduce((m, s) => m + s.wordBudget, 0),
    0,
  );
  console.log(
    `Xarita toza: ${file.units.length} unit, ${sections} bo'lim, ${words} asosiy so'z.`,
  );
}

main();
