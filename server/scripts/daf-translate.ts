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
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { translateBatch } from '../src/daf/translate/daf-translator';
import { OpenAiTranslateModel } from '../src/daf/translate/translate-model';

const BATCH = 40;

function limitArg(): number | null {
  const i = process.argv.indexOf('--limit');
  if (i === -1) return null;
  const n = Number(process.argv[i + 1]);
  return Number.isFinite(n) && n > 0 ? n : null;
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
  for (let i = 0; i < lexemes.length; i += BATCH) {
    const chunk = lexemes.slice(i, i + BATCH);
    const out = await translateBatch(
      chunk.map((l) => ({ de: l.de, en: l.en })),
      model,
    );
    for (const [j, t] of out.entries()) {
      await prisma.dafLexeme.update({
        where: { id: chunk[j].id },
        data: { uz: t.uz, translationSource: 'MODEL' },
      });
    }
    done += out.length;
    console.log(`  ${done}/${lexemes.length}`);
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
    const [title] = await translateBatch(
      [{ de: g.titleDe, en: g.titleDe }],
      model,
    );
    const [expl] = await translateBatch(
      [{ de: g.explanationEn, en: g.explanationEn }],
      model,
    );
    await prisma.dafGrammar.update({
      where: { id: g.id },
      data: {
        titleUz: title.uz,
        explanationUz: expl.uz,
        translationSource: 'MODEL',
      },
    });
    console.log(`  ${i + 1}/${grammar.length}`);
  }

  await prisma.$disconnect();
}

void main();
