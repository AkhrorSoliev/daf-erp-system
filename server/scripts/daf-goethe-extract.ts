/**
 * Goethe A1 Wortliste'sini `goethe-a1.json` ga ajratadi.
 *
 *   npm run daf:goethe-extract -- --txt /yo'l/wortliste.txt
 *
 * PDF'ni o'qish bu skriptning ishi EMAS: PDF matni bir marta, qo'lda
 * chiqariladi (`python3 -c "from pypdf import PdfReader; ..."`) va shu
 * yerga matn fayli sifatida beriladi. Sabab — PDF kutubxonasi server
 * bog'liqliklariga kirmaydi, va ajratish bir martalik ish.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import {
  parseGoetheLines,
  type GoetheFile,
  GOETHE_ZAHLEN,
  GOETHE_WOCHENTAGE,
  GOETHE_MONATE,
  GOETHE_JAHRESZEITEN,
} from '../src/daf/inhalt/goethe-parse';

const OUT = join(__dirname, '..', 'content', 'daf', 'a1', 'goethe-a1.json');
const SOURCE = 'https://www.goethe.de/pro/relaunch/prf/de/A1_SD1_Wortliste_02.pdf';

function main(): void {
  const i = process.argv.indexOf('--txt');
  if (i === -1 || !process.argv[i + 1]) {
    console.error('Kerak: --txt <matn fayli>');
    process.exit(1);
  }

  const lines = readFileSync(process.argv[i + 1], 'utf8').split('\n');
  const words = parseGoetheLines(lines);

  const gruppen = {
    zahlen: GOETHE_ZAHLEN,
    wochentage: GOETHE_WOCHENTAGE,
    monate: GOETHE_MONATE,
    jahreszeiten: GOETHE_JAHRESZEITEN,
  };

  const file: GoetheFile = { source: SOURCE, words, gruppen };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(file, null, 1)}\n`, 'utf8');

  const gruppenCount = Object.values(gruppen).reduce((sum, arr) => sum + arr.length, 0);
  console.log(`${words.length} ta bosh so'z va ${gruppenCount} ta gruppali so'z yozildi.`);
}

main();
