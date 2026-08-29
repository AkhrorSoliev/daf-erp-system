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
} from '../src/daf/sentence/sentence-validate';
import {
  generateForUnit,
  MIN_WORDS,
  MAX_WORDS,
  type GeneratedSentence,
} from '../src/daf/sentence/sentence-generate';
import {
  OpenAiTranslateModel,
  type TranslateModel,
} from '../src/daf/translate/translate-model';

/** Bo'limiga so'raladigan gaplar soni. */
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

const WORD = /[a-zA-ZäöüÄÖÜß]+/g;

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
  units: { order: number; sentences: GeneratedSentence[] }[];
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
      const n = (line.match(WORD) ?? []).filter((w) => w.length > 1).length;
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

  const force = hasFlag('--force');
  const onlyUnit = flagValue('--unit');

  // Mavjud natija saqlanadi: model chaqiruvi pul va vaqt, va har
  // chaqiruv boshqacha matn beradi — tayyor bo'limni qayta yasash
  // o'qituvchi ko'rib chiqqan gaplarni sababsiz almashtirardi.
  const existing: SentencesFile | null =
    !force && existsSync(OUT) ? readJson<SentencesFile>(OUT) : null;
  const done = new Map<number, GeneratedSentence[]>(
    (existing?.units ?? []).map((u) => [u.order, u.sentences]),
  );

  const todo = plan.units.filter((u) => {
    if (onlyUnit !== null && u.order !== Number(onlyUnit)) return false;
    return force || (done.get(u.order)?.length ?? 0) < TARGET;
  });

  if (todo.length === 0) {
    console.log('Hamma bo`lim to`la — model chaqirilmadi.');
    return;
  }

  const model = buildModel();
  const unknownTally = new Map<string, number>();
  const stats: {
    order: number;
    kept: number;
    rejectedUnknown: number;
    rejectedLength: number;
    duplicates: number;
  }[] = [];

  for (const unit of todo) {
    const index = plan.units.findIndex((u) => u.order === unit.order);
    // Ruxsat — SHU va oldingi bo'limlar; so'rov esa faqat SHU bo'limning
    // so'zlarini beradi, chunki mashq yangi so'z uchun kerak. Oldingi
    // bo'lim so'zi gapda uchrasa u rad etilmaydi — o'quvchi uni biladi.
    const allowed = cumulativeVocab(plan.units, entriesBySection, index);
    const words = unit.sections.flatMap((s) => entriesBySection.get(s) ?? []);
    const examples = cleanExamples(dib, allowed);

    console.log(
      `\n${unit.order}. ${unit.titleUz} — ${words.length} so'z, ${examples.length} namuna`,
    );

    const { kept, rejected, duplicates } = await generateForUnit(model, {
      allowed,
      words,
      examples,
      count: TARGET,
    });

    for (const r of rejected) {
      for (const w of r.unknown) {
        unknownTally.set(w, (unknownTally.get(w) ?? 0) + 1);
      }
    }
    const rejectedUnknown = rejected.filter(
      (r) => r.reason === 'unknown',
    ).length;
    stats.push({
      order: unit.order,
      kept: kept.length,
      rejectedUnknown,
      rejectedLength: rejected.length - rejectedUnknown,
      duplicates,
    });
    done.set(unit.order, kept);
    console.log(
      `   saqlandi ${kept.length}, rad etildi ${rejected.length}` +
        ` (notanish ${rejectedUnknown}, uzunlik ${rejected.length - rejectedUnknown})` +
        `, takror ${duplicates}`,
    );
    for (const r of rejected) {
      const why =
        r.reason === 'unknown' ? r.unknown.join(', ') : 'uzunlik chegarasi';
      console.log(`   ✗ ${r.de}  [${why}]`);
    }
    for (const s of kept) {
      console.log(`   ✓ ${s.de} | ${s.uz}`);
    }
  }

  const out: SentencesFile = {
    generatedAt: new Date().toISOString(),
    model: model.name,
    units: plan.units
      .filter((u) => (done.get(u.order)?.length ?? 0) > 0)
      .map((u) => ({ order: u.order, sentences: done.get(u.order) ?? [] })),
  };
  writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n', 'utf8');

  console.log('\n— Hisobot —');
  let keptAll = 0;
  let rejectedAll = 0;
  let duplicatesAll = 0;
  for (const s of stats) {
    const rejected = s.rejectedUnknown + s.rejectedLength;
    keptAll += s.kept;
    rejectedAll += rejected;
    duplicatesAll += s.duplicates;
    console.log(
      `  ${s.order}-bo'lim: saqlandi ${s.kept}, rad etildi ${rejected}` +
        ` (notanish ${s.rejectedUnknown}, uzunlik ${s.rejectedLength})` +
        `, takror ${s.duplicates}`,
    );
  }
  // Takror rad etishga qo'shilmaydi: u yaroqsizlik emas, ortiqchalik.
  const total = keptAll + rejectedAll;
  const pct = total === 0 ? 0 : Math.round((rejectedAll / total) * 100);
  console.log(
    `  Jami: saqlandi ${keptAll}, rad etildi ${rejectedAll} (${pct} %),` +
      ` takror ${duplicatesAll}`,
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
