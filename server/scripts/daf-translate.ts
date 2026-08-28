/**
 * Bazadagi nemischa kontentni o'zbekchaga o'giradi.
 *
 *   npm run daf:translate            — tarjimasi yo'qlarini o'giradi
 *   npm run daf:translate -- --limit 40   — faqat 40 tasini (namuna uchun)
 *
 * Idempotent: allaqachon tarjima qilingan qator qayta so'ralmaydi.
 * O'QITUVCHI tuzatgan tarjimaga (`translationSource: TEACHER`) hech qachon
 * tegilmaydi — model uni qayta yozib yuborsa, tuzatish jimgina yo'qolardi.
 */
import 'dotenv/config';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  translateBatch,
  TranslationCountMismatchError,
} from '../src/daf/translate/daf-translator';
import { OpenAiTranslateModel } from '../src/daf/translate/translate-model';

const BATCH = 40;

/**
 * Tarjima ham kontentning bir qismi, shuning uchun u git'ga chiqadi.
 *
 * Baza — bu MUHIT, git emas. Tarjima faqat bazada qolsa, ishlab chiqarishda
 * u yo'q bo'lardi va skriptni qaytadan yuritish kerak bo'lardi: API kaliti
 * bilan, pul sarflab, va natija boshqacha chiqib (model bir xil javob
 * bermaydi). Faylga eksport qilinganda esa prod'da tarjima UMUMAN
 * qilinmaydi — seed uni git'dan oladi, va har muhitda aynan bir xil matn
 * turadi.
 */
const EXPORT = join(__dirname, '..', 'content', 'daf', 'translations.json');

function limitArg(): number | null {
  const i = process.argv.indexOf('--limit');
  if (i === -1) return null;
  const n = Number(process.argv[i + 1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Guruhni tarjima qiladi; soni mos kelmasa GURUHNI IKKIGA BO'LIB qayta
 * so'raydi.
 *
 * `translateBatch` ataylab qat'iy: soni mos kelmasa u yiqiladi, chunki
 * siljigan tarjima ko'rinmaydigan xato — har so'z tarjimali bo'lib turadi,
 * faqat tarjimalar boshqa so'zniki bo'ladi. Lekin bitta muammoli so'z
 * uchun butun ishni to'xtatish ham to'g'ri emas.
 *
 * Shuning uchun guruh ikkiga bo'linadi va aybdor toraytiriladi. Yolg'iz
 * qolgan so'z ham mos kelmasa, u TARJIMASIZ qoldiriladi: ekranda «tarjima
 * tayyorlanmoqda» deb turadi, bu rost. Taxminiy tarjima yozish esa
 * jimgina yolg'on bo'lardi.
 */
async function translateChunk(
  items: { de: string; en: string }[],
  model: OpenAiTranslateModel,
): Promise<(string | null)[]> {
  try {
    const out = await translateBatch(
      items.map((l) => ({ de: l.de, en: l.en })),
      model,
    );
    return out.map((t) => t.uz);
  } catch (err) {
    if (!(err instanceof TranslationCountMismatchError)) throw err;

    if (items.length === 1) {
      console.warn(`  ⚠ tarjimasiz qoldi: ${items[0].de}`);
      return [null];
    }

    const half = Math.ceil(items.length / 2);
    return [
      ...(await translateChunk(items.slice(0, half), model)),
      ...(await translateChunk(items.slice(half), model)),
    ];
  }
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('OPENAI_API_KEY sozlanmagan.');
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  const model = new OpenAiTranslateModel(apiKey);
  const limit = limitArg();

  // Lug'at
  const lexemes = await prisma.dafLexeme.findMany({
    where: { uz: null },
    select: { id: true, de: true, en: true },
    orderBy: { id: 'asc' },
    ...(limit ? { take: limit } : {}),
  });
  console.log(`Lug'at: ${lexemes.length} ta tarjima kerak`);

  let done = 0;
  let skipped = 0;
  for (let i = 0; i < lexemes.length; i += BATCH) {
    const chunk = lexemes.slice(i, i + BATCH);
    const out = await translateChunk(chunk, model);
    for (const [j, uz] of out.entries()) {
      if (uz === null) {
        skipped++;
        continue;
      }
      await prisma.dafLexeme.update({
        where: { id: chunk[j].id },
        data: { uz, translationSource: 'MODEL' },
      });
      done++;
    }
    console.log(`  ${done}/${lexemes.length}`);
  }
  if (skipped > 0) {
    console.log(
      `  ${skipped} ta so'z tarjimasiz qoldi — keyingi yuritishda qayta so'raladi`,
    );
  }

  // Grammatika izohlari — uzun matn, bittalab yuboriladi.
  const grammar = await prisma.dafGrammar.findMany({
    where: { explanationUz: null },
    select: { id: true, titleDe: true, explanationEn: true },
    orderBy: { id: 'asc' },
    ...(limit ? { take: Math.max(1, Math.floor(limit / 10)) } : {}),
  });
  console.log(`Grammatika: ${grammar.length} ta izoh`);

  for (const [i, g] of grammar.entries()) {
    const [titleUz] = await translateChunk(
      [{ de: g.titleDe, en: g.titleDe }],
      model,
    );
    const [explanationUz] = await translateChunk(
      [{ de: g.explanationEn, en: g.explanationEn }],
      model,
    );
    if (titleUz === null && explanationUz === null) {
      console.warn(`  ⚠ tarjimasiz qoldi: ${g.titleDe}`);
      continue;
    }
    await prisma.dafGrammar.update({
      where: { id: g.id },
      data: { titleUz, explanationUz, translationSource: 'MODEL' },
    });
    console.log(`  ${i + 1}/${grammar.length}`);
  }

  await exportTranslations(prisma);
  await prisma.$disconnect();
}

/**
 * Bazadagi tarjimalarni faylga chiqaradi.
 *
 * O'qituvchi tuzatgani ham chiqadi va `TEACHER` deb belgilanadi — seed uni
 * modelning tarjimasi bilan qayta yozmasligi uchun manba muhim.
 */
async function exportTranslations(prisma: PrismaClient) {
  const [lexemes, grammar, lessons] = await Promise.all([
    // Audio oraliqlari ham shu faylga chiqadi. Ular tarjima emas, lekin
    // ayni muammoga ega: faqat bazada yashaydi va `dib.json` da yo'q.
    // Ikkinchi fayl va ikkinchi mexanizm ochish o'rniga bittasi
    // kengaytirildi — ular birga yaratiladi va birga qo'llanadi.
    prisma.dafLexeme.findMany({
      where: {
        OR: [{ uz: { not: null } }, { audioStartMs: { not: null } }],
      },
      select: {
        sourceId: true,
        uz: true,
        translationSource: true,
        audioStartMs: true,
        audioEndMs: true,
      },
      orderBy: { sourceId: 'asc' },
    }),
    prisma.dafGrammar.findMany({
      where: {
        OR: [{ titleUz: { not: null } }, { explanationUz: { not: null } }],
      },
      select: {
        sourceId: true,
        titleUz: true,
        explanationUz: true,
        translationSource: true,
      },
      orderBy: { sourceId: 'asc' },
    }),
    prisma.dafLesson.findMany({
      where: { titleUz: { not: null } },
      select: { sourceId: true, titleUz: true, translationSource: true },
      orderBy: { sourceId: 'asc' },
    }),
  ]);

  writeFileSync(
    EXPORT,
    JSON.stringify({ lexemes, grammar, lessons }, null, 2) + '\n',
    'utf8',
  );
  console.log(
    `\nEksport: ${lexemes.length} so'z, ${grammar.length} grammatika, ${lessons.length} dars → content/daf/translations.json`,
  );
}

void main();
