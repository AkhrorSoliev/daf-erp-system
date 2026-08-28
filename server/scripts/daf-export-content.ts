/**
 * Bazadagi boyitishni git'ga chiqaradi.
 *
 *   npm run daf:export-content
 *
 * Tarjima va audio oraliqlari `dib.json` da YO'Q — ular bazada
 * yaratiladi (model tarjima qiladi, Whisper moslashtiradi). Baza esa
 * MUHIT: ishlab chiqarishda ular bo'lmaydi.
 *
 * Shuning uchun ular faylga chiqadi va seed o'sha fayldan qo'yadi.
 * Aks holda ishlab chiqarishda tarjimani qaytadan yuritish kerak
 * bo'lardi — pul sarflab, va natija boshqacha chiqib (model bir xil
 * javob bermaydi); audio moslashtirish esa Whisper va ffmpeg
 * o'rnatilishini talab qilardi.
 */
import 'dotenv/config';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const OUT = join(__dirname, '..', 'content', 'daf', 'translations.json');

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  const [lexemes, grammar, lessons] = await Promise.all([
    prisma.dafLexeme.findMany({
      where: { OR: [{ uz: { not: null } }, { audioStartMs: { not: null } }] },
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
    OUT,
    JSON.stringify({ lexemes, grammar, lessons }, null, 2) + '\n',
    'utf8',
  );

  const withAudio = lexemes.filter((l) => l.audioStartMs !== null).length;
  const withUz = lexemes.filter((l) => l.uz).length;
  console.log(`Lug'at:      ${lexemes.length} yozuv`);
  console.log(`  tarjima:   ${withUz}`);
  console.log(`  audio:     ${withAudio}`);
  console.log(`Grammatika:  ${grammar.length}`);
  console.log(`Dars nomi:   ${lessons.length}`);
  console.log(`\n→ content/daf/translations.json`);

  await prisma.$disconnect();
}

void main();
