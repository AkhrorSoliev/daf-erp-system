/**
 * A1 bo'limlari uchun mashq gaplarini YASAYDI (manbadan ko'chirmaydi).
 *
 *   npm run daf:gen-sentences                — gapi yetishmagan bo'limlar
 *   npx ts-node scripts/daf-gen-sentences.ts --unit 1   — faqat 1-bo'lim
 *   npm run daf:gen-sentences -- --force     — hammasini qayta yasaydi
 *
 * Nega ko'chirilmaydi: manbadagi A1 qisqa gaplarining atigi 30 % i
 * o'quvchi bilgan so'zlardan tuzilgan (4-taskda o'lchandi). Qolganida
 * notanish so'z bor — bunday gap mashq emas, to'siq. Shuning uchun gap
 * bo'limning o'z lug'atidan so'raladi va HAR BIRI validatordan o'tadi.
 *
 * Natija git'ga chiqadi (`content/daf/sentences.json`): baza — bu MUHIT,
 * git emas. Fayl bo'lmasa har muhitda model qaytadan chaqirilardi — pul
 * sarflab, va har safar boshqacha matn bilan.
 */
import 'dotenv/config';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  cumulativeVocab,
  unknownWords,
  wordsOf,
} from '../src/daf/sentence/sentence-validate';
import {
  generateForUnit,
  materialWords,
  sourceSentences,
  sentenceKey,
  MIN_WORDS,
  MAX_WORDS,
  type RejectReason,
  type RejectedSentence,
  type StoredSentence,
} from '../src/daf/sentence/sentence-generate';
import {
  OpenAiTranslateModel,
  type TranslateModel,
} from '../src/daf/translate/translate-model';

/**
 * Bo'limiga SO'RALADIGAN gaplar soni — kafolat emas, so'rov.
 *
 * Bo'lim shunchasini bermasligi mumkin va bu normal: 1-bo'lim lug'atining
 * 42 yozuvidan 13 tasi salomlashish undovi, ular gap qura olmaydi.
 * Sun'iy ravishda 30 ga yetkazish uchun qoidalarni bo'shatish mashqni
 * buzardi — nechta tabiiy chiqsa, o'shancha olinadi.
 */
const TARGET = 30;

/**
 * So'rovga qo'yiladigan namunalar soni.
 *
 * Namuna uslub uchun, lug'at uchun emas — ko'pi bilan 8 ta, chunki uzun
 * ro'yxat modelni namunalarni QAYTA YOZISHGA undaydi.
 */
const MAX_EXAMPLES = 8;

// Namuna gapning uzunligi mashq gapiniki bilan bir xil bo'ladi:
// chegara `sentence-generate.ts` da, bitta joyda turadi.

const CONTENT = join(__dirname, '..', 'content', 'daf');
const OUT = join(CONTENT, 'sentences.json');

interface Unit {
  order: number;
  titleDe: string;
  titleUz: string;
  sections: string[];
}

interface DibEntry {
  de: string;
}

/** `translations.json` dagi tarjima; `sourceId` — `<bo'lim>#<tartib>`. */
interface Lexeme {
  sourceId: string;
  uz: string | null;
}

interface DibSection {
  id: string;
  entries?: DibEntry[];
}

interface DibTranscript {
  chapter: number;
  linesDe: string[];
}

interface Dib {
  sections: DibSection[];
  transcripts: DibTranscript[];
}

interface SentencesFile {
  generatedAt: string;
  model: string;
  units: { order: number; sentences: StoredSentence[] }[];
}

/** Natijani faylga yozadi. Gapi yo'q bo'lim faylga chiqmaydi. */
function writeOut(
  done: Map<number, StoredSentence[]>,
  plan: { units: Unit[] },
  modelName: string,
): void {
  const out: SentencesFile = {
    generatedAt: new Date().toISOString(),
    model: modelName,
    units: plan.units
      .filter((u) => (done.get(u.order)?.length ?? 0) > 0)
      .map((u) => ({ order: u.order, sentences: done.get(u.order) ?? [] })),
  };
  writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n', 'utf8');
}

/** Rad etish sababi — hisobot uchun o'qiladigan shaklda. */
function whyRejected(r: RejectedSentence): string {
  if (r.reason === 'unknown') return r.unknown.join(', ');
  if (r.reason === 'length') return 'uzunlik chegarasi';
  return "bo'limning yangi so'zi yo'q";
}

function flagValue(name: string): string | null {
  const i = process.argv.indexOf(name);
  if (i === -1) return null;
  const v = process.argv[i + 1];
  return typeof v === 'string' && !v.startsWith('--') ? v : null;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

/**
 * Manbadagi TOZA qisqa gaplar — 4-taskning o'lchov mantiqi bilan.
 *
 * Bu gaplar mashq sifatida ishlatilmaydi (ular yetarli emas), lekin
 * uslub namunasi sifatida qimmatli: model qanday ohangda yozishni
 * ko'radi, va namunaning o'zi validatordan o'tgan bo'ladi.
 */
function cleanExamples(dib: Dib, allowed: Set<string>): string[] {
  const out: string[] = [];
  for (const t of dib.transcripts) {
    for (const line of t.linesDe) {
      const n = wordsOf(line).length;
      if (n < MIN_WORDS || n > MAX_WORDS) continue;
      if (unknownWords(line, allowed).length > 0) continue;
      if (out.includes(line)) continue;
      out.push(line);
      if (out.length >= MAX_EXAMPLES) return out;
    }
  }
  return out;
}

function buildModel(): TranslateModel {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY sozlanmagan.');
  return new OpenAiTranslateModel(apiKey);
}

async function main() {
  const dib = readJson<Dib>(join(CONTENT, 'dib.json'));
  const plan = readJson<{ units: Unit[] }>(join(CONTENT, 'a1-units.json'));
  const entriesBySection = new Map<string, string[]>(
    dib.sections.map((s) => [s.id, (s.entries ?? []).map((e) => e.de)]),
  );

  // Tarjima `dib.json` da emas, alohida faylda yashaydi va yozuvga
  // `<bo'lim>#<tartib>` kaliti bilan bog'lanadi (tartib birdan boshlanadi).
  const translations = readJson<{ lexemes: Lexeme[] }>(
    join(CONTENT, 'translations.json'),
  );
  const uzBySourceId = new Map(
    translations.lexemes.map((l) => [l.sourceId, l.uz]),
  );
  const entriesWithUz = (
    sectionId: string,
  ): { de: string; uz: string | null }[] =>
    (dib.sections.find((s) => s.id === sectionId)?.entries ?? []).map(
      (e, i) => ({
        de: e.de,
        uz: uzBySourceId.get(`${sectionId}#${i + 1}`) ?? null,
      }),
    );

  const force = hasFlag('--force');
  const onlyUnit = flagValue('--unit');

  // Mavjud natija saqlanadi: model chaqiruvi pul va vaqt, va har
  // chaqiruv boshqacha matn beradi — tayyor bo'limni qayta yasash
  // o'qituvchi ko'rib chiqqan gaplarni sababsiz almashtirardi.
  //
  // Fayl `--force` da ham O'QILADI: bayroq «hammasini unut» degani
  // emas, «nishonga olingan bo'limni qayta yasa» degani. Aks holda
  // `--force --unit 2` faylni bitta bo'limga qisqartirib, qolgan
  // bo'limlarni jimgina yo'q qilardi.
  const existing: SentencesFile | null = existsSync(OUT)
    ? readJson<SentencesFile>(OUT)
    : null;
  const done = new Map<number, StoredSentence[]>(
    (existing?.units ?? []).map((u) => [u.order, u.sentences]),
  );

  const todo = plan.units.filter((u) => {
    if (onlyUnit !== null && u.order !== Number(onlyUnit)) return false;
    // «TARGET ga yetmagani» emas, «umuman yo'g'i»: bo'lim tabiiy
    // ravishda 30 ga yetmasligi mumkin, va o'sha chegara bilan har
    // yuritishda o'sha bo'lim qayta so'ralib, pul sarflanib, tayyor
    // gaplar sababsiz almashaverardi.
    return force || (done.get(u.order)?.length ?? 0) === 0;
  });

  // Manbadan olingan gaplar HAR yuritishda qayta hisoblanadi.
  //
  // Ular modeldan emas, lug'atdan keladi: tekin, va aynan bir xil
  // takrorlanadi. Muzlatib qo'yilgani uchun tanlash qoidasidagi
  // tuzatish faylga hech qachon yetib bormasdi — 8 so'zli
  // «Möchtest du Salz oder Zucker auf deinem Popcorn?» faylda aynan
  // shu sababdan qolib ketgan edi. Yasalgan gaplarga tegilmaydi:
  // ular pul turadi va qayta chaqiruv boshqa matn berardi.
  let refreshed = 0;
  for (const unit of plan.units) {
    const prev = done.get(unit.order);
    if (prev === undefined) continue;
    if (todo.some((u) => u.order === unit.order)) continue;

    const fresh = unit.sections.flatMap((sec) =>
      sourceSentences(entriesWithUz(sec)),
    );
    const keys = new Set(fresh.map((x) => sentenceKey(x.de)));
    const generated = prev.filter(
      (x) => x.origin === 'GENERATED' && !keys.has(sentenceKey(x.de)),
    );
    const next = [...fresh, ...generated];
    if (JSON.stringify(next) !== JSON.stringify(prev)) refreshed++;
    done.set(unit.order, next);
  }
  if (refreshed > 0) {
    console.log(`Manbadagi gaplar yangilandi: ${refreshed} bo'lim`);
  }

  if (todo.length === 0) {
    console.log('Hamma bo`lim to`la — model chaqirilmadi.');
    writeOut(done, plan, existing?.model ?? 'gpt-4o-mini');
    return;
  }

  const model = buildModel();
  const unknownTally = new Map<string, number>();
  const stats: {
    order: number;
    kept: number;
    rejectedUnknown: number;
    rejectedLength: number;
    rejectedNoNew: number;
    duplicates: number;
    fromSource: number;
  }[] = [];

  for (const unit of todo) {
    const index = plan.units.findIndex((u) => u.order === unit.order);
    // Ruxsat — SHU va oldingi bo'limlar; so'rov esa faqat SHU bo'limning
    // so'zlarini beradi, chunki mashq yangi so'z uchun kerak. Oldingi
    // bo'lim so'zi gapda uchrasa u rad etilmaydi — o'quvchi uni biladi.
    const allowed = cumulativeVocab(plan.units, entriesBySection, index);
    // Yagona bo'limli ro'yxat — «shu bo'limning o'zi» degani.
    // `cumulativeVocab` qayta ishlatildi, chunki so'z shakllarini
    // hosil qilish qoidasi bitta joyda turishi kerak.
    const newWords = cumulativeVocab([unit], entriesBySection, 0);
    // So'rovga faqat QURILISH MATERIALI beriladi. Tayyor ifodalar
    // («Wer ist das?») model uchun emas — ular gap sifatida to'g'ridan
    // to'g'ri olinadi.
    const words = materialWords(
      unit.sections.flatMap((s) => entriesBySection.get(s) ?? []),
    );
    // Oldingi bo'limlarning materiali ham so'rovga chiqadi: validator
    // uni allaqachon kechiradi, va yashirish modelni gap qura olmaydigan
    // holga solardi (2-bo'lim: sof sonlar, 0 gap).
    const knownWords = materialWords(
      plan.units
        .slice(0, index)
        .flatMap((u) => u.sections)
        .flatMap((s) => entriesBySection.get(s) ?? []),
    );
    const fromSource = unit.sections.flatMap((s) =>
      sourceSentences(entriesWithUz(s)),
    );
    const examples = cleanExamples(dib, allowed);

    console.log(
      `\n${unit.order}. ${unit.titleUz} — ${words.length} so'z,` +
        ` (+${knownWords.length} tanish), ${examples.length} namuna,` +
        ` manbadan ${fromSource.length} gap`,
    );

    const { kept, rejected, duplicates } = await generateForUnit(model, {
      allowed,
      newWords,
      words,
      knownWords,
      examples,
      count: TARGET,
    });

    for (const r of rejected) {
      for (const w of r.unknown) {
        unknownTally.set(w, (unknownTally.get(w) ?? 0) + 1);
      }
    }
    const count = (reason: RejectReason) =>
      rejected.filter((r) => r.reason === reason).length;
    stats.push({
      order: unit.order,
      kept: kept.length,
      rejectedUnknown: count('unknown'),
      rejectedLength: count('length'),
      rejectedNoNew: count('no-new-word'),
      duplicates,
      fromSource: fromSource.length,
    });
    // Manbadagi gap oldinda turadi: uni odam yozgan, ya'ni sifati
    // yuqoriroq. Model o'sha gapni qayta yasagan bo'lsa, nusxasi
    // tashlanadi.
    const seen = new Set(fromSource.map((x) => sentenceKey(x.de)));
    const generated = kept.filter((x) => !seen.has(sentenceKey(x.de)));
    const overlap = kept.length - generated.length;
    done.set(unit.order, [
      ...fromSource,
      ...generated.map((x) => ({ ...x, origin: 'GENERATED' as const })),
    ]);
    if (overlap > 0) {
      console.log(
        `   ${overlap} ta yasalgan gap manbadagisi bilan bir xil — tashlandi`,
      );
    }
    console.log(
      `   saqlandi ${kept.length}, rad etildi ${rejected.length}` +
        ` (notanish ${count('unknown')}, uzunlik ${count('length')},` +
        ` yangi so'zsiz ${count('no-new-word')}), takror ${duplicates}`,
    );
    for (const r of rejected) {
      console.log(`   ✗ ${r.de}  [${whyRejected(r)}]`);
    }
    for (const s of done.get(unit.order) ?? []) {
      console.log(
        `   ✓ [${s.origin === 'SOURCE' ? 'manba' : 'yasama'}] ${s.de} | ${s.uz}`,
      );
    }
  }

  writeOut(done, plan, model.name);

  console.log('\n— Hisobot —');
  let keptAll = 0;
  let rejectedAll = 0;
  let duplicatesAll = 0;
  for (const s of stats) {
    const rejected = s.rejectedUnknown + s.rejectedLength + s.rejectedNoNew;
    keptAll += s.kept;
    rejectedAll += rejected;
    duplicatesAll += s.duplicates;
    console.log(
      `  ${s.order}-bo'lim: yasaldi ${s.kept}, manbadan ${s.fromSource},` +
        ` rad etildi ${rejected} (notanish ${s.rejectedUnknown},` +
        ` uzunlik ${s.rejectedLength}, yangi so'zsiz ${s.rejectedNoNew}),` +
        ` takror ${s.duplicates}`,
    );
  }
  // Takror rad etishga qo'shilmaydi: u yaroqsizlik emas, ortiqchalik.
  const total = keptAll + rejectedAll;
  const pct = total === 0 ? 0 : Math.round((rejectedAll / total) * 100);
  const sourceAll = stats.reduce((a, x) => a + x.fromSource, 0);
  console.log(
    `  Jami: yasaldi ${keptAll}, manbadan ${sourceAll}, rad etildi` +
      ` ${rejectedAll} (${pct} %), takror ${duplicatesAll}`,
  );

  const top = [...unknownTally.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);
  if (top.length > 0) {
    console.log('  Eng ko`p uchragan notanish so`zlar:');
    console.log(`    ${top.map(([w, n]) => `${w} (${n})`).join(', ')}`);
  }
  console.log(`\nYozildi: ${OUT}`);
}

void main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
