/**
 * Unit matnini tekshiradi.
 *
 *   npm run daf:inhalt-check -- --unit 1
 *
 * Muammo topilsa 1 kod bilan chiqadi va ro'yxatni to'liq ko'rsatadi.
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { validateWortliste } from '../src/daf/inhalt/wortliste.validate';
import type { WortlisteFile } from '../src/daf/inhalt/wortliste.types';
import type {
  WoerterFile,
  GrammatikFile,
} from '../src/daf/inhalt/unit-inhalt.types';
import type { KursFile } from '../src/daf/kurs/kurs.types';
import type { GoetheFile } from '../src/daf/inhalt/goethe-parse';

const A1 = join(__dirname, '..', 'content', 'daf', 'a1');
const read = <T>(...p: string[]): T =>
  JSON.parse(readFileSync(join(A1, ...p), 'utf8')) as T;

function main(): void {
  const i = process.argv.indexOf('--unit');
  if (i === -1 || !process.argv[i + 1]) {
    console.error('Kerak: --unit <raqam>');
    process.exit(1);
  }
  const code = `u${String(Number(process.argv[i + 1])).padStart(2, '0')}`;

  // `validateWortliste` butun GoetheFile'ni oladi — sonlarning raqam
  // ko'rinishi va yopiq guruhlar (`isWordInGoetheA1` orqali) shu yerda
  // markazlashgan holda tekshiriladi.
  const problems = validateWortliste(
    read<WortlisteFile>('wortliste.json'),
    read<KursFile>('kurs.json'),
    read<GoetheFile>('goethe-a1.json'),
  );

  const woerterPath = join(A1, code, 'woerter.json');
  if (!existsSync(woerterPath)) {
    problems.push(`${code}: woerter.json yo'q`);
  } else {
    const w = read<WoerterFile>(code, 'woerter.json');
    const core = w.woerter.filter((x) => x.core).length;
    if (core !== 50) problems.push(`${code}: ${core} ta asosiy so'z — 50 kerak`);
  }

  const grammatikPath = join(A1, code, 'grammatik.json');
  if (!existsSync(grammatikPath)) {
    problems.push(`${code}: grammatik.json yo'q`);
  } else {
    const g = read<GrammatikFile>(code, 'grammatik.json');
    const unit = read<KursFile>('kurs.json').units.find((u) => u.code === code);
    const want = unit?.sections.length ?? 0;
    if (g.regeln.length !== want) {
      problems.push(`${code}: ${g.regeln.length} qoida — ${want} kerak`);
    }
  }

  if (problems.length > 0) {
    console.error(`${problems.length} ta muammo:`);
    problems.forEach((p) => console.error(`  - ${p}`));
    process.exit(1);
  }

  console.log(`${code}: matn toza.`);
}

main();
