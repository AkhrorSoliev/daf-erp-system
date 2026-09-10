/**
 * Bo'limning so'zlaridan gap yasaydi.
 *
 *   npm run daf:gen-saetze -- --unit 1
 *
 * PULLIK: har bo'lim uchun bitta model chaqiruvi. Mavjud gaplar QAYTA
 * yasalmaydi — fayl bor bo'lsa, yetishmagan bo'lim uchungina chaqiriladi.
 */
import 'dotenv/config';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { OpenAiTranslateModel } from '../src/daf/translate/translate-model';
import {
  buildSentencePrompt,
  parseSentences,
  materialWords,
} from '../src/daf/sentence/sentence-generate';
import {
  sectionsInCourseOrder,
  knownWordsBySection,
  hilfsSet,
  tokensOf,
  unknownWordsIn,
} from '../src/daf/inhalt/progression';
import type { KursFile } from '../src/daf/kurs/kurs.types';
import type {
  SaetzeFile,
  Satz,
  WoerterFile,
  Wort,
  HilfswoerterFile,
} from '../src/daf/inhalt/unit-inhalt.types';

const A1 = join(__dirname, '..', 'content', 'daf', 'a1');
const PRO_ABSCHNITT = 12;

function wordCount(de: string): number {
  return de
    .replace(/[.,!?]/g, '')
    .trim()
    .split(/\s+/).length;
}

function sentenceKey(de: string): string {
  return de
    .toLowerCase()
    .replace(/[.,!?]/g, '')
    .trim();
}

/**
 * Yakka harf yoki raqamli tokenlar TTS tomonidan inglizcha o'qiladi
 * ("C" → "cee", "7" → "seven"). Bunday token bo'lsa gap o'ziga tts
 * talab qiladi.
 */
function bareLetterOrDigit(token: string): boolean {
  return /^[a-zäöüß]$/i.test(token) || /^\d+$/.test(token);
}

function needsTts(de: string): boolean {
  return de
    .replace(/[.,!?]/g, '')
    .split(/\s+/)
    .some((t) => t !== '' && bareLetterOrDigit(t));
}

/**
 * Yakka harfni gapning o'zida qanday aytish kerakligiga almashtiradi
 * (`C` → vocab'dagi `tts` maydoni, masalan "Tseh"). Raqam tokeni
 * uchrasa — bu unit'da raqam so'zlar TO'LIQ yozilgan holda beriladi
 * (`sieben`, raqam belgisi emas), shuning uchun bu holat amalda faqat
 * modelning qoidani buzgan javobida chiqishi mumkin va qo'lda
 * ko'rikdan o'tkaziladi.
 */
function buildTts(de: string, letterTts: Map<string, string>): string {
  return de
    .split(/(\s+)/)
    .map((chunk) => {
      const bare = chunk.replace(/[.,!?]/g, '');
      if (/^[a-zäöüß]$/i.test(bare)) {
        const spoken = letterTts.get(bare.toLowerCase());
        if (spoken) return chunk.replace(bare, spoken);
      }
      return chunk;
    })
    .join('');
}

function letterTtsMap(woerter: WoerterFile): Map<string, string> {
  const out = new Map<string, string>();
  for (const w of woerter.woerter) {
    if (/^[A-ZÄÖÜ]$/.test(w.de) && w.tts) {
      out.set(w.de.toLowerCase(), w.tts);
    }
  }
  return out;
}

/**
 * Bo'lim uslub namunalari — QO'LDA yozilgan, progressiya filtridan
 * albatta o'tadigan gaplar. Kalit — BO'LIM kodi, ya'ni yangi unit
 * o'z namunalarini shu yerga qo'shadi.
 *
 * u01 ning birinchi yuritishida (5 chaqiruv, 17 gap) rad etishning
 * aksariyati ikki turkumdan edi: modelning O'ZI o'ylab topgan
 * otlar/ismlar (Freund, Müller, Katzen, Jahre) va yordamchi ro'yxatda
 * yo'q fe'l shakllari. Namunalar bu ikkalasidan ham QOCHADI, shuning
 * uchun model qanday gap qurish kerakligini so'z bilan emas, misol
 * bilan ko'radi.
 */
const SECTION_EXAMPLES: Record<string, string[]> = {
  'u01-s1': [
    'Wie ist dein Name, bitte?',
    'Ich bin hier, und du?',
    'Bist du hier?',
  ],
  'u01-s2': ['Wie heißen Sie, bitte?', 'Wer ist das?'],
  'u01-s3': [
    'Woher kommst du?',
    'Ich komme aus Usbekistan.',
    'Wo wohnst du?',
    'Ich wohne in Deutschland.',
  ],
  'u01-s4': [
    'Fünf und drei ist acht.',
    'Wir sind zehn.',
    'Ihr seid neun.',
    'Zwei und zwei ist vier.',
  ],
  'u01-s5': [
    'Buchstabieren Sie das, bitte.',
    'Ist das ein C oder ein E?',
    'Ist das ein H oder ein J?',
  ],
};

/**
 * `buildSentencePrompt` ga QO'SHIMCHA — funksiyaning o'zi o'zgartirilmaydi
 * (u boshqa chaqiruvchida ham ishlatiladi va u yerda sinovdan o'tgan).
 * Bu qo'shimcha faqat shu skriptning so'roviga qo'shiladi, chunki u
 * yuritishlarning ANIQ rad etish sabablarini yopadi.
 *
 * UNIT BO'YICHA: har unitning o'z fe'llari va o'z tuzoqlari bor, ya'ni
 * bitta umumiy matn ikkinchi unitda noto'g'ri fe'l ro'yxatini
 * majburlagan bo'lardi.
 */
const UNIT_GUIDANCE: Record<string, string> = {
  u01: [
    '',
    'Qo`shimcha qoidalar:',
    '- Erfinde KEINE Namen (Vor- oder Nachnamen), Tiere, Verwandte,',
    '  Sprachenlisten, Alter, Zahlen von Geschwistern/Büchern, Wörter wie',
    '  "Freund", "müde", "dort", "heute", "machen", "Wort", "kein",',
    '  "Englisch", "viele" — nur Wörter aus der Liste oben und den',
    '  bekannten Wörtern.',
    '- Benutze NUR diese Verben, und NUR in diesen Formen:',
    '  "sein" (bin/bist/ist/sind/seid), "heißen" (nur "heißen"),',
    '  "kommen" (nur "komme"/"kommst"), "wohnen" (nur "wohne"/"wohnst"),',
    '  "sprechen" (nur "sprechen"), "buchstabieren" (nur "buchstabieren").',
    '  Kein anderes Verb (kein "haben", "machen", "geben", "mögen", usw.).',
  ].join('\n'),
};

/**
 * Bo'lim-maxsus qo'shimcha qoida.
 *
 * u01-s4/u01-s5 uchun: birinchi yuritishlar ko'p gapni to'g'ri, lekin
 * bo'limning O'ZI bilan aloqasi yo'q holda qaytardi ("Ich bin aus
 * Deutschland." raqamsiz — u01-s4 ostida), va yakka olmosh+raqam
 * qolipi ("Ich bin eins.", "Du bist zwei.") ma'nosiz chiqdi — odam
 * hech qachon shunday demaydi. Ikkala muammoning aniq javobi shu yerda.
 */
const SECTION_EXTRA: Record<string, string> = {
  'u01-s4': [
    '',
    'Zahlen — Muster:',
    '- JEDER Satz enthält MINDESTENS EINE Zahl aus der Liste oben.',
    '- Erlaubt: "Wir/Ihr/Sie sind/seid ZAHL." (Gruppenzahl, z. B. "Wir',
    '  sind fünf."), "ZAHL und ZAHL ist ZAHL." (Rechnen), "Ist das eine',
    '  ZAHL oder eine ZAHL?" (Vergleich).',
    '- VERBOTEN: "Ich bin ZAHL." / "Du bist ZAHL." / "Er/Sie ist ZAHL."',
    '  (ohne Kontext unsinnig — niemand sagt das).',
  ].join('\n'),
  'u01-s5': [
    '',
    'Alphabet — Muster:',
    '- JEDER Satz enthält MINDESTENS EINEN Buchstaben aus der Liste oben',
    '  ODER das Wort "buchstabieren".',
    '- Erlaubt: "Ist das ein BUCHSTABE oder ein BUCHSTABE?" (mit',
    '  verschiedenen Buchstabenpaaren), "Buchstabieren Sie das, bitte."',
    '- VERBOTEN: Sätze ohne Buchstaben, die nur Namen/Länder/Grüße',
    '  wiederholen.',
  ].join('\n'),
};

/**
 * Qaysi bo'limlarda gap bo'limning O'Z so'zini o'z ichiga OLISHI shart.
 *
 * u01 da bu faqat sonlar va alifbo uchun edi: model "Ich bin aus
 * Deutschland." kabi to'g'ri, lekin bo'lim materialini umuman mashq
 * qilmaydigan gapni sonlar bo'limi ostiga qo'yardi. Boshqa bo'limlarda
 * umumiy takrorlash foydali, shuning uchun majburlanmagan.
 *
 * `'alle'` — unitning hamma bo'limi uchun majburiy.
 */
const THEMA_PFLICHT: Record<string, 'alle' | string[]> = {
  u01: ['u01-s4', 'u01-s5'],
};

function sectionWordSet(sectionWoerter: Wort[]): Set<string> {
  const out = new Set<string>();
  for (const w of sectionWoerter) {
    for (const tok of w.de.toLowerCase().split(/\s+/)) out.add(tok);
  }
  return out;
}

interface SectionReport {
  section: string;
  kept: number;
  rejectedLength: string[];
  rejectedUnknown: { de: string; unknown: string[] }[];
  rejectedDuplicate: string[];
  rejectedOffTopic: string[];
  skipped: boolean;
}

function sectionsFilter(): Set<string> | null {
  const i = process.argv.indexOf('--sections');
  if (i === -1) return null;
  const v = process.argv[i + 1];
  return new Set(v.split(',').map((s) => s.trim()));
}

async function main(): Promise<void> {
  const i = process.argv.indexOf('--unit');
  const code = `u${String(Number(process.argv[i + 1])).padStart(2, '0')}`;
  const only = sectionsFilter();

  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY yo'q");

  const kurs = JSON.parse(
    readFileSync(join(A1, 'kurs.json'), 'utf8'),
  ) as KursFile;
  const woerter = JSON.parse(
    readFileSync(join(A1, code, 'woerter.json'), 'utf8'),
  ) as WoerterFile;
  const hilfs = hilfsSet(
    JSON.parse(
      readFileSync(join(A1, 'hilfswoerter.json'), 'utf8'),
    ) as HilfswoerterFile,
  );

  // Tanish so'zlar OLDINGI unitlarni ham qamraydi: u02 ning gapida u01
  // so'zi tanish. Faqat shu unitning lug'atiga qarash modelning to'g'ri
  // gaplarini keraksiz rad etardi.
  const alleWoerter: Wort[] = kurs.units
    .map((u) => u.code)
    .filter((c) => existsSync(join(A1, c, 'woerter.json')))
    .flatMap(
      (c) =>
        (
          JSON.parse(
            readFileSync(join(A1, c, 'woerter.json'), 'utf8'),
          ) as WoerterFile
        ).woerter,
    );
  const known = knownWordsBySection(sectionsInCourseOrder(kurs), alleWoerter);

  const out = join(A1, code, 'saetze.json');
  const file: SaetzeFile = existsSync(out)
    ? (JSON.parse(readFileSync(out, 'utf8')) as SaetzeFile)
    : { unit: code, saetze: [] };

  const model = new OpenAiTranslateModel(key);
  const unit = kurs.units.find((u) => u.code === code);
  if (!unit) throw new Error(`Xaritada yo'q unit: ${code}`);

  const letterTts = letterTtsMap(woerter);
  const oldingi: string[] = [];
  const reports: SectionReport[] = [];
  let calls = 0;

  for (const s of unit.sections) {
    const bor = file.saetze.filter((x) => x.section === s.code).length;
    const sectionWoerter: Wort[] = woerter.woerter.filter(
      (w) => w.section === s.code && w.core,
    );
    const words = sectionWoerter.map((w) => w.de);
    const topicWords = sectionWordSet(sectionWoerter);

    if (only !== null && !only.has(s.code)) {
      oldingi.push(...words);
      continue;
    }

    if (bor >= PRO_ABSCHNITT) {
      oldingi.push(...words);
      console.log(`${s.code}: ${bor} gap bor — o'tkazildi`);
      reports.push({
        section: s.code,
        kept: 0,
        rejectedLength: [],
        rejectedUnknown: [],
        rejectedDuplicate: [],
        rejectedOffTopic: [],
        skipped: true,
      });
      continue;
    }

    // Ko'p so'raladi (haqiqiy kerakdan ko'proq): rad etish darajasi
    // ayniqsa raqam va harf bo'limlarida yuqori, va bitta chaqiruvda
    // ko'proq nomzod olish qo'shimcha chaqiruvdan arzonroq.
    const ask = Math.min(25, Math.max(20, (PRO_ABSCHNITT - bor) * 3));

    // `buildSentencePrompt(words, examples, count, knownWords)` —
    // argumentlar POZITSION, obyekt emas.
    const prompt =
      buildSentencePrompt(
        materialWords(words),
        SECTION_EXAMPLES[s.code] ?? [],
        ask,
        materialWords(oldingi),
      ) +
      (UNIT_GUIDANCE[code] ?? '') +
      (SECTION_EXTRA[s.code] ?? '');

    const raw = await model.complete(prompt);
    calls++;
    const yangi = parseSentences(raw);

    const report: SectionReport = {
      section: s.code,
      kept: 0,
      rejectedLength: [],
      rejectedUnknown: [],
      rejectedDuplicate: [],
      rejectedOffTopic: [],
      skipped: false,
    };

    for (const g of yangi) {
      const key2 = sentenceKey(g.de);
      const takror = file.saetze.some((x) => sentenceKey(x.de) === key2);
      if (takror) {
        report.rejectedDuplicate.push(g.de);
        continue;
      }

      const wc = wordCount(g.de);
      if (wc < 3 || wc > 7) {
        report.rejectedLength.push(g.de);
        continue;
      }

      // Progressiya BO'LIM darajasida tekshiriladi (test ham shunday):
      // keyingi bo'limning so'zini ishlatgan gap qabul qilinsa, u
      // faylga tushib, keyin qo'riqchida yiqilardi.
      const unknown = unknownWordsIn(
        g.de,
        known.get(s.code) ?? new Set<string>(),
        hilfs,
      );
      if (unknown.length > 0) {
        report.rejectedUnknown.push({ de: g.de, unknown });
        continue;
      }

      // Bo'lim gapida bo'limning O'ZIGA xos so'zi topilmasa, u shu
      // bo'limning yangi materialini mashq qilmaydi (masalan "Ich bin
      // aus Deutschland." u01-s4 ostida — raqamsiz). Qaysi bo'limlarda
      // majburiy ekani `THEMA_PFLICHT` da.
      const pflicht = THEMA_PFLICHT[code];
      const themaPflichtig =
        pflicht === 'alle' || (pflicht?.includes(s.code) ?? false);
      if (themaPflichtig && !tokensOf(g.de).some((t) => topicWords.has(t))) {
        report.rejectedOffTopic.push(g.de);
        continue;
      }

      const satz: Satz = {
        section: s.code,
        de: g.de,
        uz: g.uz,
        wordCount: wc,
        origin: 'GENERATED',
      };
      if (needsTts(satz.de)) {
        satz.tts = buildTts(satz.de, letterTts);
      }
      file.saetze.push(satz);
      report.kept++;
    }

    reports.push(report);
    console.log(
      `${s.code}: ${yangi.length} gap qaytdi, ${report.kept} qabul qilindi ` +
        `(uzunlik: ${report.rejectedLength.length}, notanish: ${report.rejectedUnknown.length}, ` +
        `takror: ${report.rejectedDuplicate.length}, mavzudan tashqari: ${report.rejectedOffTopic.length})`,
    );
    oldingi.push(...words);
  }

  writeFileSync(out, `${JSON.stringify(file, null, 1)}\n`, 'utf8');
  console.log(`Jami: ${file.saetze.length} gap. ${calls} ta model chaqiruvi.`);

  for (const r of reports) {
    if (r.rejectedUnknown.length > 0) {
      console.log(`\n${r.section} — notanish so'z sababli rad etildi:`);
      for (const u of r.rejectedUnknown) {
        console.log(`  "${u.de}" — [${u.unknown.join(', ')}]`);
      }
    }
    if (r.rejectedLength.length > 0) {
      console.log(`\n${r.section} — uzunlik sababli rad etildi:`);
      for (const de of r.rejectedLength) {
        console.log(`  "${de}"`);
      }
    }
    if (r.rejectedDuplicate.length > 0) {
      console.log(`\n${r.section} — takror sababli rad etildi:`);
      for (const de of r.rejectedDuplicate) {
        console.log(`  "${de}"`);
      }
    }
    if (r.rejectedOffTopic.length > 0) {
      console.log(`\n${r.section} — mavzudan tashqari sababli rad etildi:`);
      for (const de of r.rejectedOffTopic) {
        console.log(`  "${de}"`);
      }
    }
  }
}

void main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
