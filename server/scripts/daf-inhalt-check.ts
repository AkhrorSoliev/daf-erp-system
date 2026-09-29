/**
 * Unit matnini tekshiradi.
 *
 *   npm run daf:inhalt-check -- --unit 1
 *
 * Muammo topilsa 1 kod bilan chiqadi va ro'yxatni to'liq ko'rsatadi.
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  kernwoerterImBudget,
  UNIT_WORDS_MAX,
  validateWortliste,
} from '../src/daf/inhalt/wortliste.validate';
import { validateEindeutigkeit } from '../src/daf/inhalt/unit-inhalt.validate';
import { validateHoerFragen } from '../src/daf/inhalt/hoer-fragen.validate';
import {
  validateDialogAudio,
  type DialogAudioManifest,
} from '../src/daf/inhalt/dialog-audio';
import {
  bildPlanFuerUnit,
  validateBildPlan,
  type BildPlan,
} from '../src/daf/inhalt/bild-plan';
import type { BildManifest } from '../src/daf/media/bild-keys';
import {
  sectionsInCourseOrder,
  knownWordsBySection,
  hilfsSetFor,
  unknownWordsIn,
} from '../src/daf/inhalt/progression';
import type { WortlisteFile } from '../src/daf/inhalt/wortliste.types';
import type {
  WoerterFile,
  GrammatikFile,
  RedemittelFile,
  DialogeFile,
  HilfswoerterFile,
  Wort,
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
  const wortliste = read<WortlisteFile>('wortliste.json');
  const problems = validateWortliste(
    wortliste,
    read<KursFile>('kurs.json'),
    read<GoetheFile>('goethe-a1.json'),
  );

  const woerterPath = join(A1, code, 'woerter.json');
  if (!existsSync(woerterPath)) {
    problems.push(`${code}: woerter.json yo'q`);
  } else {
    const w = read<WoerterFile>(code, 'woerter.json');
    // Words built from taught ones (`ausserhalbBudget`) do not count.
    const core = kernwoerterImBudget(w.woerter, wortliste);
    if (core !== UNIT_WORDS_MAX)
      problems.push(
        `${code}: ${core} ta asosiy so'z — ${UNIT_WORDS_MAX} kerak`,
      );

    // Iboralar fayli bo'lmasligi mumkin (unit hali yozilayotgan bo'lsa) —
    // u holda so'zlar baribir tekshiriladi.
    const redemittelPath = join(A1, code, 'redemittel.json');
    problems.push(
      ...validateEindeutigkeit(
        w,
        existsSync(redemittelPath)
          ? read<RedemittelFile>(code, 'redemittel.json')
          : null,
      ),
    );

    // Pictures: both files are optional until pictures are made.
    const plan: BildPlan = existsSync(join(A1, 'bild-plan.json'))
      ? read<BildPlan>('bild-plan.json')
      : {};
    const bilder: BildManifest = existsSync(join(A1, 'bilder.json'))
      ? read<BildManifest>('bilder.json')
      : {};
    problems.push(
      ...validateBildPlan(bildPlanFuerUnit(plan, code), w.woerter, bilder),
    );
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

  const dialogePath = join(A1, code, 'dialoge.json');
  if (!existsSync(dialogePath)) {
    problems.push(`${code}: dialoge.json yo'q`);
  } else {
    const dialoge = read<DialogeFile>(code, 'dialoge.json');
    const kurs = read<KursFile>('kurs.json');
    const hilfswoerter = read<HilfswoerterFile>('hilfswoerter.json');
    const sections = sectionsInCourseOrder(kurs);
    // Tanish so'zlar — testdagi bilan bir xil manba: matni bor hamma unit.
    const alleWoerter: Wort[] = kurs.units
      .map((u) => u.code)
      .filter((c) => existsSync(join(A1, c, 'woerter.json')))
      .flatMap((c) => read<WoerterFile>(c, 'woerter.json').woerter);
    const known = knownWordsBySection(sections, alleWoerter);
    const unbekannt = (section: string) => (text: string) =>
      unknownWordsIn(
        text,
        known.get(section) ?? new Set<string>(),
        hilfsSetFor(section, hilfswoerter, sections),
      );
    problems.push(
      ...dialoge.dialoge.flatMap((d) =>
        validateHoerFragen(d, unbekannt(d.section)),
      ),
    );

    const manifestPath = join(A1, 'dialog-audio.json');
    const manifest: DialogAudioManifest = existsSync(manifestPath)
      ? read<DialogAudioManifest>('dialog-audio.json')
      : {};
    problems.push(...validateDialogAudio(dialoge.dialoge, manifest));
  }

  if (problems.length > 0) {
    console.error(`${problems.length} ta muammo:`);
    problems.forEach((p) => console.error(`  - ${p}`));
    process.exit(1);
  }

  console.log(`${code}: matn toza.`);
}

main();
