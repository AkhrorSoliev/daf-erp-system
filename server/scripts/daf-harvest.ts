/**
 * DiB va ZUM kontentini yig'ib, `server/content/daf/` ga yozadi.
 *
 *   npm run daf:harvest
 *
 * Nest kontekstini KO'TARMAYDI (`refresh-videothek.ts` bilan bir sabab):
 * `AppModule` bilan Telegram bot ham ishga tushardi va lokal dev server
 * bilan `getUpdates` ustida to'qnashardi.
 *
 * Tarmoq javoblari `server/.cache/daf/` ga keshlanadi. Manbani qaytadan
 * o'qish kerak bo'lsa, o'sha katalogni o'chiring.
 */
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { DibClient } from '../src/daf-content/dib/dib-client';
import { parseVocabPage } from '../src/daf-content/dib/dib-vocab.parser';
import {
  parseTranscriptPage,
  parseVideoList,
} from '../src/daf-content/dib/dib-transcript.parser';
import { parseChapterPage } from '../src/daf-content/dib/dib-chapter.parser';
import { labelChapter } from '../src/daf-content/level-labeler';
import { collectAssets } from '../src/daf-content/media/media-manifest';
import { validateDataset } from '../src/daf-content/dataset.validate';
import type { AssetRef, DafDataset } from '../src/daf-content/dataset.types';

const OUT = join(__dirname, '..', 'content', 'daf');
const CACHE = join(__dirname, '..', '.cache', 'daf');
const CHAPTERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const LICENSE = 'CC BY 4.0';
const ATTRIBUTION =
  'Deutsch im Blick, COERLL, The University of Texas at Austin — CC BY 4.0';

async function harvestDib(): Promise<DafDataset> {
  const client = new DibClient(CACHE);
  const d: DafDataset = {
    source: 'DIB',
    harvestedAt: new Date().toISOString(),
    license: LICENSE,
    attribution: ATTRIBUTION,
    chapters: [],
    sections: [],
    transcripts: [],
    videos: [],
  };

  for (const k of CHAPTERS) {
    d.chapters.push(parseChapterPage(await client.fetchText(`toc.php?k=${k}`), k));
    d.sections.push(...parseVocabPage(await client.fetchText(`voc.php?k=${k}`), k));

    const videos = parseVideoList(await client.fetchText(`rss.php?k=${k}&a=mp4`));
    for (const v of videos) {
      // Har bir video RSS'da ro'yxatlanganning o'zi bilan `d.videos`ga tushadi —
      // transkripti bor-yo'qligidan qat'i nazar. Aks holda «sik» (Sprache im
      // Kontext) va «intro» videolar (manba saytida transkript paneli bo'lmagan
      // `vid.php`ga yo'naltiriladi) hech qachon media manifestga, demak R2'ga
      // ham tushmay qolardi.
      const asset: AssetRef = {
        sourceUrl: `https://media.la.utexas.edu/dib/video/${v.fileId}.mp4`,
        key: `dib/video/${v.fileId}.mp4`,
        kind: 'VIDEO',
        license: LICENSE,
        attribution: ATTRIBUTION,
      };
      d.videos.push(asset);

      const page = await client.fetchText(`vidt.php?f=${v.fileId}`);
      const t = parseTranscriptPage(page, v.fileId, k);
      if (t) d.transcripts.push(t);
    }
    process.stdout.write(`  bob ${k}: tayyor\n`);
  }

  return d;
}

async function main() {
  mkdirSync(OUT, { recursive: true });

  console.log('DiB yig\'ilmoqda...');
  const dib = await harvestDib();

  const errors = validateDataset(dib);
  if (errors.length > 0) {
    console.error(`\nDataset ${errors.length} ta muammo bilan chiqdi:`);
    for (const e of errors.slice(0, 20)) console.error(`  - ${e}`);
    process.exitCode = 1;
    return;
  }

  writeFileSync(join(OUT, 'dib.json'), JSON.stringify(dib, null, 2), 'utf8');
  writeFileSync(
    join(OUT, 'media-manifest.json'),
    JSON.stringify(collectAssets(dib), null, 2),
    'utf8',
  );

  console.log('\n=== Hisobot ===');
  console.log(`Bo'limlar:    ${dib.sections.length}`);
  console.log(
    `Lug'at:       ${dib.sections.reduce((n, s) => n + s.entries.length, 0)}`,
  );
  console.log(`Videolar:     ${dib.videos.length}`);
  console.log(`Transkript:   ${dib.transcripts.length}`);
  console.log(
    `Transkriptsiz video: ${dib.videos.length - dib.transcripts.length}` +
      '  (kutilgan holat — manba saytida faqat intervyu videolari' +
      ' transkriptlanadi, "sik" va "intro" videolarda transkript umuman yo\'q)',
  );
  console.log(`Media aktiv:  ${collectAssets(dib).length}`);

  console.log('\nDaraja bo\'yicha boblar:');
  for (const c of dib.chapters) {
    const l = labelChapter(c);
    const mark = l.needsReview ? '  ⚠ ko\'rik kerak' : '';
    console.log(`  bob ${String(c.chapter).padStart(2)}  ${l.level}  ${l.reason}${mark}`);
  }

  // Ikkita chegara ATAYIN mustaqil. DiB saytida faqat intervyu videolari
  // (`vidt.php`, transkript paneli bilan) transkriptlanadi — «sik» (Sprache im
  // Kontext) va «intro» videolar boshqa sahifaga (`vid.php`, transkript
  // panelisiz) yo'naltiriladi. Shuning uchun transkript soni video sonidan
  // DOIM kam bo'ladi — bu XATO EMAS, kutilgan taqsimot. Video soni ~268,
  // ulardan ~199 tasi (intervyu videolari) haqiqiy transkriptga ega —
  // qolgan ~69 tasida transkript sahifada shunchaki YO'Q.
  //
  // Birinchi tekshiruv RSS ro'yxatining o'zi qisqarib qolganini ushlaydi
  // (masalan manba formatini o'zgartirsa); ikkinchisi — transkript
  // parserining buzilib ketganini. Ikkalasi ham chegarani pasaytirish bilan
  // emas, manba va parserni qo'lda tekshirish bilan hal qilinadi.
  if (dib.videos.length < 250) {
    console.error(
      `\nDIQQAT: ${dib.videos.length} ta video — kutilgani ~268. Manba o'zgardimi?`,
    );
    process.exitCode = 1;
  }
  if (dib.transcripts.length < 190) {
    console.error(
      `\nDIQQAT: ${dib.transcripts.length} ta transkript — kutilgani ~199` +
        " (faqat intervyu videolari). Parser buzildimi?",
    );
    process.exitCode = 1;
  }
}

void main();
