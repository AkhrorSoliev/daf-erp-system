/**
 * Writes `content/daf/a1/goethe-a1.json` from the Goethe A1 word list.
 *
 *   npm run daf:goethe-extract -- --tsv wortliste.tsv
 *
 * One manual step comes first: turn the official PDF
 * (https://www.goethe.de/pro/relaunch/prf/de/A1_SD1_Wortliste_02.pdf) into
 * word positions with poppler's pdftotext:
 *
 *   pdftotext -tsv A1_SD1_Wortliste_02.pdf wortliste.tsv
 *
 * Reading the PDF is not this script's job: pdftotext is not a server
 * dependency, and the extraction is rare. The TSV is not committed. After a
 * run, `npx jest src/daf/inhalt` checks the written file.
 */
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  GOETHE_GRUPPEN,
  mergeGoethe,
  parseGoetheTsv,
  type GoetheFile,
} from '../src/daf/inhalt/goethe-parse';

const OUT = join(__dirname, '..', 'content', 'daf', 'a1', 'goethe-a1.json');
const SOURCE =
  'https://www.goethe.de/pro/relaunch/prf/de/A1_SD1_Wortliste_02.pdf';

function main(): void {
  const i = process.argv.indexOf('--tsv');
  if (i === -1 || !process.argv[i + 1]) {
    console.error('Needed: --tsv <output of pdftotext -tsv>');
    process.exit(1);
  }
  const tsv = readFileSync(process.argv[i + 1], 'utf8');

  // The groups are hand-transcribed: each word must be printed on pp. 5–8.
  const seiten5bis8 = tsv
    .split('\n')
    .map((l) => l.split('\t'))
    .filter((r) => r[0] === '5' && +r[1] >= 5 && +r[1] <= 8)
    .map((r) => r[11])
    .join(' ')
    .replace(/­/g, ''); // soft hyphen, as in "Antwort­bogen"
  const fehlt = GOETHE_GRUPPEN.filter((e) => !seiten5bis8.includes(e.wort));
  if (fehlt.length > 0) {
    console.error(
      `Not on pp. 5–8 of the PDF: ${fehlt.map((e) => e.wort).join(', ')}`,
    );
    process.exit(1);
  }

  const alphabetisch = parseGoetheTsv(tsv);
  const file: GoetheFile = {
    source: SOURCE,
    woerter: mergeGoethe([...alphabetisch, ...GOETHE_GRUPPEN]),
  };
  writeFileSync(OUT, `${JSON.stringify(file, null, 1)}\n`, 'utf8');

  console.log(
    `${file.woerter.length} words written: ${alphabetisch.length} from the alphabetical list, ${GOETHE_GRUPPEN.length} from the groups, merged.`,
  );
}

main();
