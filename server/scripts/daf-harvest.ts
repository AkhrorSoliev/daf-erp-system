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
 *
 * DIQQAT: kesh kaliti Faza 1b da sha1'ga o'tdi. Eski `.cache/daf/` dagi
 * fayllar endi topilmaydi va manba qaytadan o'qiladi — bu bir martalik.
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
import {
  parseGrammarIndex,
  parseGrammarPage,
} from '../src/daf-content/dib/dib-grammar.parser';
import type { SkipStats } from '../src/daf-content/dib/dib-grammar.parser';
import { parsePhoneticsPage } from '../src/daf-content/dib/dib-phonetics.parser';
import {
  parseExerciseSets,
  type ExerciseSet,
} from '../src/daf-content/dib/dib-exercise-set.parser';
import { parseAnswerKey } from '../src/daf-content/dib/dib-answer-key.parser';
import { attachAnswerKey } from '../src/daf-content/dib/dib-answer-key.attach';
import {
  DIB_LICENSE,
  DIB_ATTRIBUTION,
} from '../src/daf-content/dib/dib-license';
import { labelChapter } from '../src/daf-content/level-labeler';
import { collectAssets } from '../src/daf-content/media/media-manifest';
import { validateDataset } from '../src/daf-content/dataset.validate';
import {
  lemmaOf,
  enrichLexeme,
} from '../src/daf-content/wort-schule/wort-schule.parser';
import { WortSchuleAdapter } from '../src/daf-content/wort-schule/wort-schule.adapter';
import { WortSchuleClient } from '../src/daf-content/wort-schule/wort-schule-client';
import type { AssetRef, DafDataset } from '../src/daf-content/dataset.types';

const OUT = join(__dirname, '..', 'content', 'daf');
const CACHE = join(__dirname, '..', '.cache', 'daf');
const CHAPTERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const GG_BASE = 'https://coerll.utexas.edu/gg/';

/**
 * Tekshirgichga yuboriladigan "javob" — ATAYLAB noto'g'ri.
 *
 * Bizni tekshirgichning bahosi qiziqtirmaydi; javob sahifasi TO'G'RI
 * javoblarni belgilab qaytaradi va bizga kerakli narsa shu. Har o'rin
 * to'ldirilishi kerak: bo'sh forma «No form data was submitted» bilan rad
 * etiladi, va bunday rad etish nol javob emas, XATO — `parseAnswerKey` uni
 * yiqilish bilan bildiradi.
 */
function dummyFormBody(set: ExerciseSet): string {
  const field = set.type === 'mcr' ? 'mc' : set.type;
  return Array.from(
    { length: set.count },
    (_, i) => `${field}_${i + 1}=${set.type === 'mcr' ? '1' : 'zz'}`,
  ).join('&');
}

async function harvestDib(): Promise<{
  dataset: DafDataset;
  skippedSpans: number;
}> {
  const client = new DibClient(CACHE);
  const d: DafDataset = {
    source: 'DIB',
    harvestedAt: new Date().toISOString(),
    license: DIB_LICENSE,
    attribution: DIB_ATTRIBUTION,
    chapters: [],
    sections: [],
    transcripts: [],
    videos: [],
    grammar: [],
    phonetics: [],
    documents: [],
  };

  // DiB RSS ba'zan BITTA bobning o'z ichida ham bir xil yozuvni ikki marta
  // beradi (masalan `07_04_int_hm_gesundleben`). `fileId` global miqyosda
  // kuzatiladi — u manba bo'yicha yagona — shuning uchun bir fayl `videos`
  // ro'yxatiga va (bo'lsa) `transcripts` ro'yxatiga FAQAT bir marta tushadi.
  const seenFileIds = new Set<string>();

  for (const k of CHAPTERS) {
    const chapterInfo = parseChapterPage(
      await client.fetchText(`toc.php?k=${k}`),
      k,
    );
    const label = labelChapter(chapterInfo);
    chapterInfo.level = label.level;
    chapterInfo.needsReview = label.needsReview;
    chapterInfo.reason = label.reason;
    d.chapters.push(chapterInfo);

    d.sections.push(
      ...parseVocabPage(await client.fetchText(`voc.php?k=${k}`), k),
    );

    const videos = parseVideoList(
      await client.fetchText(`rss.php?k=${k}&a=mp4`),
    );
    for (const v of videos) {
      if (seenFileIds.has(v.fileId)) continue;
      seenFileIds.add(v.fileId);

      // Har bir video RSS'da ro'yxatlanganning o'zi bilan `d.videos`ga tushadi —
      // transkripti bor-yo'qligidan qat'i nazar. Aks holda «sik» (Sprache im
      // Kontext) va «intro» videolar (manba saytida transkript paneli bo'lmagan
      // `vid.php`ga yo'naltiriladi) hech qachon media manifestga, demak R2'ga
      // ham tushmay qolardi.
      const asset: AssetRef = {
        sourceUrl: `https://media.la.utexas.edu/dib/video/${v.fileId}.mp4`,
        key: `dib/video/${v.fileId}.mp4`,
        kind: 'VIDEO',
        license: DIB_LICENSE,
        attribution: DIB_ATTRIBUTION,
        // RSS sarlavhasi Faza 2'ning kutubxona UI'siga kerak bo'ladigan
        // yagona inson-o'qiy oladigan nom — transkriptsiz videolar uchun
        // dataset'da boshqa hech qanday nom yo'q.
        title: v.title || undefined,
      };
      d.videos.push(asset);

      const page = await client.fetchText(`vidt.php?f=${v.fileId}`);
      const t = parseTranscriptPage(page, v.fileId, k);
      if (t) d.transcripts.push(t);
    }
    process.stdout.write(`  bob ${k}: tayyor\n`);
  }

  // Grimm Grammar DiB'ning o'zida emas, qo'shni bo'limda joylashgan — nisbiy
  // yo'l (`../gg/...`) `DIB_BASE`dan yuqoriga chiqib, coerll.utexas.edu/gg/
  // ga tushadi.
  //
  // INTERAKTIV sahifa o'qiladi (`gg/gr/`), bosma emas: faqat u mashq
  // to'plamlarining chegarasini, savollar sonini va har bo'sh joyning
  // raqamini beradi. Javob kaliti o'sha raqamlar bo'yicha biriktiriladi.
  const indexHtml = await client.fetchText('../gg/gr/index.html');
  const codes = parseGrammarIndex(indexHtml);
  console.log(`  grammatika sahifalari: ${codes.length}`);

  // Har sahifa REORDER'ga aylanolmagan (ikkitadan kam tokenli) span'larni
  // o'tkazib yuboradi — bu yo'qotish jim qolmasligi uchun 92 sahifa
  // bo'ylab yig'ilib, hisobotda ko'rsatiladi.
  const skipStats: SkipStats = { skipped: 0 };
  let answered = 0;
  for (const code of codes) {
    const page = await client.fetchText(`../gg/gr/${code}.html`);
    const g = parseGrammarPage(page, code, skipStats);
    if (!g) continue;

    // Javob kaliti to'plam-bo'yicha olinadi va O'RIN RAQAMI bo'yicha
    // biriktiriladi. `attachAnswerKey` har o'rinning aynan bir marta
    // ishlatilishini talab qiladi — mos kelmasa u yiqiladi va butun yig'ish
    // to'xtaydi. Bu ataylab: javobi boshqa mashqniki bo'lgan mashq
    // javobsizidan yomonroq, chunki xato ko'rinmaydi.
    const withAnswers: typeof g.exercises = [];
    for (const set of parseExerciseSets(page)) {
      const mine = g.exercises.filter((e) => e.setCode === set.code);
      const html = await client.postForm(
        `${GG_BASE}ex_set_proc.php?ec=${set.code}`,
        dummyFormBody(set),
      );
      const key = parseAnswerKey(html, set.code);
      if (key.length === 0 && mine.length === 0) continue;
      withAnswers.push(...attachAnswerKey(mine, key, set.code));
    }
    g.exercises = withAnswers;
    answered += withAnswers.length;

    d.grammar.push(g);
  }
  console.log(`  javobi bor mashqlar: ${answered}`);

  for (const k of CHAPTERS) {
    const html = await client.fetchText(`pho.php?k=${k}`);
    d.phonetics.push(...parsePhoneticsPage(html, k));
  }

  // Har bob uchun bitta Kurs-Paket PDF — matni o'qilmaydi, faqat R2'ga
  // ko'chadi (Faza 2'ning hujjat kutubxonasi uchun).
  for (const k of CHAPTERS) {
    const file = `k_${String(k).padStart(2, '0')}.pdf`;
    d.documents.push({
      sourceUrl: `https://coerll.utexas.edu/dib/pdfs/${file}`,
      key: `dib/pdf/${file}`,
      kind: 'PDF',
      license: DIB_LICENSE,
      attribution: DIB_ATTRIBUTION,
    });
  }

  return { dataset: d, skippedSpans: skipStats.skipped };
}

/**
 * Lug'at yozuvlarini `wort.schule` metama'lumotlari bilan boyitadi.
 *
 * `parseWordJson` rasm bo'lmasa ham, boshqa foydali maydon (bo'g'inlar,
 * sinonimlar, mavzular) bo'lsa yozuvni qaytaradi — shuning uchun boyitilgan
 * yozuvlar soni (`enriched`) va rasm topilgan yozuvlar soni (`imageHits`)
 * IKKI XIL son. Hisobotda («Rasmli so'z») aynan `imageHits` ko'rsatiladi.
 *
 * `client.fetchWord` chinakam nosozlikni (5xx, tarmoq uzilishi, cheklov)
 * yutmaydi — bu yerda ATAYLAB tutilmaydi, xato yig'ishni to'xtatadi. Sabab:
 * ~625 so'rovning yarmi muvaffaqiyatsiz bo'lganda ham jim davom etish, ochiq
 * ko'rinadigan-u aslida chala to'ldirilgan korpus berardi — kesh borligi
 * uchun qayta ishga tushirish arzon, shuning uchun to'xtash xavfsizroq.
 */
async function enrichVocabulary(
  d: DafDataset,
): Promise<{ enriched: number; imageHits: number }> {
  // Lemmaga tushadigan yozuvlarni yig'amiz va qayerda turganini eslab qolamiz.
  const wanted = new Map<string, { section: number; entry: number }[]>();
  d.sections.forEach((s, si) =>
    s.entries.forEach((e, ei) => {
      const lemma = lemmaOf(e.de);
      if (!lemma) return;
      const list = wanted.get(lemma) ?? [];
      list.push({ section: si, entry: ei });
      wanted.set(lemma, list);
    }),
  );

  const adapter = new WortSchuleAdapter(
    [...wanted.keys()],
    new WortSchuleClient(join(CACHE, 'ws')),
  );

  let enriched = 0;
  let imageHits = 0;
  for await (const raw of adapter.harvest()) {
    const entry = adapter.map(raw);
    if (!entry) continue;

    for (const at of wanted.get(raw.lemma) ?? []) {
      const s = d.sections[at.section];
      s.entries[at.entry] = enrichLexeme(s.entries[at.entry], entry);
      enriched++;
      if (entry.image) imageHits++;
    }
  }

  return { enriched, imageHits };
}

async function main() {
  mkdirSync(OUT, { recursive: true });

  console.log("DiB yig'ilmoqda...");
  const { dataset: dib, skippedSpans } = await harvestDib();

  console.log('wort.schule bilan boyitilmoqda...');
  const { enriched, imageHits } = await enrichVocabulary(dib);
  console.log(`  boyitilgan yozuvlar: ${enriched}, rasmli: ${imageHits}`);

  const errors = validateDataset(dib);
  if (errors.length > 0) {
    console.error(`\nDataset ${errors.length} ta muammo bilan chiqdi:`);
    for (const e of errors.slice(0, 20)) console.error(`  - ${e}`);
    process.exitCode = 1;
    return;
  }

  // Bo'sag'a tekshiruvi YOZISHDAN OLDIN turadi — validatsiya xatosi bilan bir
  // xil qoida. Avval yozib, keyin tekshirish chala yig'ilgan datasetni
  // committed faylning USTIGA yozib yuborardi: muammo faqat exit code orqali
  // bilinib, fayl esa buzilgan holda qolardi.
  //
  // Ikkita chegara ATAYIN mustaqil. DiB saytida faqat intervyu videolari
  // (`vidt.php`, transkript paneli bilan) transkriptlanadi — «sik» (Sprache im
  // Kontext) va «intro» videolar boshqa sahifaga (`vid.php`, transkript
  // panelisiz) yo'naltiriladi. Shuning uchun transkript soni video sonidan
  // DOIM kam bo'ladi — bu XATO EMAS, kutilgan taqsimot.
  //
  // Birinchi tekshiruv RSS ro'yxatining o'zi qisqarib qolganini ushlaydi
  // (masalan manba formatini o'zgartirsa); ikkinchisi — transkript
  // parserining buzilib ketganini. Ikkalasi ham chegarani pasaytirish bilan
  // emas, manba va parserni qo'lda tekshirish bilan hal qilinadi.
  let thresholdFailed = false;
  if (dib.videos.length < 250) {
    console.error(
      `\nDIQQAT: ${dib.videos.length} ta video — kutilgani ~263. Manba o'zgardimi?`,
    );
    thresholdFailed = true;
  }
  if (dib.transcripts.length < 190) {
    console.error(
      `\nDIQQAT: ${dib.transcripts.length} ta transkript — kutilgani ~198` +
        ' (faqat intervyu videolari). Parser buzildimi?',
    );
    thresholdFailed = true;
  }
  if (dib.grammar.length < 85) {
    console.error(
      `\nDIQQAT: ${dib.grammar.length} ta grammatika sahifasi — kutilgani 92. Manba o'zgardimi?`,
    );
    thresholdFailed = true;
  }
  // Mashqlar bo'sag'asi: to'plam-bo'yicha sanoq tekshiruvi allaqachon har
  // to'plamni alohida qo'riqlaydi, lekin u to'plam TOPILGAN bo'lsagina
  // ishlaydi. Formalar umuman o'qilmay qolsa (masalan manba `proc_post`ni
  // tashlab, boshqa mexanizmga o'tsa) hech qanday to'plam bo'lmaydi, hech
  // qanday mos kelmaslik chiqmaydi, va natija jimgina nolga tushadi — 256
  // ta mashqni yo'qotgan xatoning aynan o'zi.
  const exercises = dib.grammar.reduce((n, g) => n + g.exercises.length, 0);
  if (exercises < 1100) {
    console.error(
      `\nDIQQAT: ${exercises} ta mashq — kutilgani ~1 180. Mashq formalari o'qilyaptimi?`,
    );
    thresholdFailed = true;
  }
  if (dib.phonetics.length < 55) {
    console.error(
      `\nDIQQAT: ${dib.phonetics.length} ta talaffuz bo'limi — kutilgani ~61.`,
    );
    thresholdFailed = true;
  }
  // `wort.schule`ga xos ikkita bo'sag'a: manzil sxemasi o'zgarsa (yoki sayt
  // vaqtincha butunlay 404 qaytarsa), `fetchWord` HAR bir so'rovni "so'z
  // yo'q" deb talqin qilib `null` qaytaradi — boyitish jimgina nolga tushadi
  // va hech qanday tekshiruv buni ushlamas edi, chunki bu ikkalasi
  // to'liq DiB-ga xos edi. Natijada harvest 0 bilan chiqib, committed
  // datasetning 76 ta rasmi va 288 ta boyitilgan yozuvini o'chirib
  // yuborardi — hech qanday signalsiz.
  if (enriched < 200) {
    console.error(
      `\nDIQQAT: ${enriched} ta boyitilgan yozuv — kutilgani ~288. wort.schule manzili o'zgardimi?`,
    );
    thresholdFailed = true;
  }
  if (imageHits < 50) {
    console.error(
      `\nDIQQAT: ${imageHits} ta rasmli so'z — kutilgani ~76. wort.schule manzili o'zgardimi?`,
    );
    thresholdFailed = true;
  }
  if (thresholdFailed) {
    process.exitCode = 1;
    return;
  }

  const assets = collectAssets(dib);
  writeFileSync(join(OUT, 'dib.json'), JSON.stringify(dib, null, 2), 'utf8');
  writeFileSync(
    join(OUT, 'media-manifest.json'),
    JSON.stringify(assets, null, 2),
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
  console.log(`Grammatika:   ${dib.grammar.length} sahifa`);
  const allExercises = dib.grammar.flatMap((g) => g.exercises);
  // Javob holati bo'yicha taqsimot. «Ochiq» — manba javob bermagan mashqlar
  // (gap birlashtirish, so'z tartiblash): ular ko'rsatiladi, lekin
  // avtomatik tekshirilmaydi. Bu raqam yashirilmaydi — mashq dvigateli
  // qancha mashqni o'zi baholay olishini shu belgilaydi.
  const byStatus = (st: string) =>
    allExercises.filter((e) => e.answerStatus === st).length;

  console.log(
    `Mashq gapi:   ${allExercises.length}` +
      ` (javobli ${byStatus('FROM_SOURCE')}, qisman ${byStatus('PARTIAL')},` +
      ` ochiq ${byStatus('OPEN')})`,
  );
  const exercisesByKind = new Map<string, number>();
  for (const ex of allExercises) {
    exercisesByKind.set(ex.kind, (exercisesByKind.get(ex.kind) ?? 0) + 1);
  }
  for (const [kind, count] of exercisesByKind) {
    console.log(`  ${kind}: ${count}`);
  }
  // Yo'qotish jim qolmasligi uchun — REORDER'ga aylanolmagan (ikkitadan kam
  // tokenli) span'lar soni shu yerda ko'rsatiladi (Task 3).
  console.log(
    `  o'tkazib yuborilgan span'lar: ${skippedSpans} (ikkitadan kam tokenli, REORDER emas)`,
  );
  console.log(`Talaffuz:     ${dib.phonetics.length}`);
  console.log(`Hujjat (PDF): ${dib.documents.length}`);
  console.log(`Rasmli so'z:  ${imageHits} (wort.schule, CC0)`);
  console.log(`Media aktiv:  ${assets.length}`);

  console.log("\nDaraja bo'yicha boblar:");
  for (const c of dib.chapters) {
    const l = labelChapter(c);
    const mark = l.needsReview ? "  ⚠ ko'rik kerak" : '';
    console.log(
      `  bob ${String(c.chapter).padStart(2)}  ${l.level}  ${l.reason}${mark}`,
    );
  }
}

void main();
