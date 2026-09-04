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
import type { KursFile } from '../src/daf/kurs/kurs.types';
import type {
  SaetzeFile,
  Satz,
  WoerterFile,
  Wort,
} from '../src/daf/inhalt/unit-inhalt.types';

const A1 = join(__dirname, '..', 'content', 'daf', 'a1');
const PRO_ABSCHNITT = 12;

/**
 * `unit-inhalt.file.spec.ts` dagi "gaplarda notanish so'z yo'q" testi
 * bilan ATAYLAB BIR XIL ro'yxat.
 *
 * Nusxalanishning sababi — kafolat: skript shu ro'yxat bilan filtrlasa,
 * faylga yozilgan har bir gap o'sha testdan albatta o'tadi. Ikkisi
 * uzoqlashib ketsa (masalan test yangilanib bu yerda unutilsa) skript
 * yana ham qattiqroq filtrlagani uchun xavfsiz tomonda qoladi — faqat
 * ba'zi yaroqli gap keraksiz rad etiladi, hech qachon aksincha emas.
 */
const HILFS = new Set([
  'ich',
  'du',
  'sie',
  'er',
  'es',
  'wir',
  'ihr',
  'bin',
  'bist',
  'ist',
  'sind',
  'seid',
  'und',
  'oder',
  'nicht',
  'ja',
  'nein',
  'wie',
  'wo',
  'was',
  'wer',
  'woher',
  'das',
  'der',
  'die',
  'ein',
  'eine',
  'mein',
  'dein',
  'sehr',
  'auch',
  'bitte',
  'danke',
  'in',
  'aus',
  'heisse',
  'heisst',
  'komme',
  'kommst',
  'wohne',
  'wohnst',
  'geht',
  'gut',
  'dir',
  'ihnen',
  'mir',
  'hier',
]);

function wordCount(de: string): number {
  return de
    .replace(/[.,!?]/g, '')
    .trim()
    .split(/\s+/).length;
}

function tokensOf(de: string): string[] {
  return de
    .toLowerCase()
    .replace(/[.,!?]/g, '')
    .split(/\s+/)
    .filter((w) => w !== '');
}

function bekanntSet(woerter: WoerterFile): Set<string> {
  return new Set(
    woerter.woerter.flatMap((w) => w.de.toLowerCase().split(/\s+/)),
  );
}

function unknownWordsIn(de: string, bekannt: Set<string>): string[] {
  return tokensOf(de).filter((w) => !bekannt.has(w) && !HILFS.has(w));
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
 * Bo'lim uslub namunalari — QO'LDA yozilgan, `unknownWordsIn`/`HILFS`
 * dan albatta o'tadigan gaplar.
 *
 * Birinchi yuritishda (5 chaqiruv, 17 gap) rad etishning aksariyati
 * ikki turkumdan edi: modelning O'ZI o'ylab topgan otlar/ismlar
 * (Freund, Müller, Katzen, Jahre) va HILFS ro'yxatida yo'q fe'l
 * shakllari (heiße/heißt — ß bilan, HILFS esa "heisse"/"heisst" ASCII
 * yozuvini biladi; spreche/sprichst — sprechen HILFS'da umuman yo'q;
 * kommt/wohnt — 3-shaxs, HILFS faqat 1/2-shaxsni biladi). Namunalar bu
 * ikkalasidan ham QOCHADI, shuning uchun model qanday gap qurish
 * kerakligini so'z bilan emas, misol bilan ko'radi.
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
 * birinchi yuritishning ANIQ ikkita rad etish sababini yopadi.
 */
const EXTRA_GUIDANCE = [
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
].join('\n');

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

  const out = join(A1, code, 'saetze.json');
  const file: SaetzeFile = existsSync(out)
    ? (JSON.parse(readFileSync(out, 'utf8')) as SaetzeFile)
    : { unit: code, saetze: [] };

  const model = new OpenAiTranslateModel(key);
  const unit = kurs.units.find((u) => u.code === code);
  if (!unit) throw new Error(`Xaritada yo'q unit: ${code}`);

  const bekannt = bekanntSet(woerter);
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
      EXTRA_GUIDANCE +
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

      const unknown = unknownWordsIn(g.de, bekannt);
      if (unknown.length > 0) {
        report.rejectedUnknown.push({ de: g.de, unknown });
        continue;
      }

      // Bo'lim gapiga bo'limning O'ZIGA xos so'zi topilmasa, u shu
      // bo'limning yangi materialini mashq qilmaydi (masalan "Ich bin
      // aus Deutschland." u01-s4 ostida — raqamsiz). Faqat s4/s5 uchun
      // majburiy: qolgan bo'limlarda umumiy takrorlash foydali bo'lishi
      // mumkin (masalan "Wie geht es dir?").
      if (
        (s.code === 'u01-s4' || s.code === 'u01-s5') &&
        !tokensOf(g.de).some((t) => topicWords.has(t))
      ) {
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
