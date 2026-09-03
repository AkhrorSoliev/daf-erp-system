/**
 * `dib.json` ni bazaga tushiradi.
 *
 *   npm run daf:seed
 *
 * Idempotent: qayta yuritish yangilaydi, takrorlamaydi. Manbadan yo'qolgan
 * mashq o'chirilmaydi — nafaqaga chiqariladi.
 */
import 'dotenv/config';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  DafSeedService,
  type TranslationFile,
} from '../src/daf/seed/daf-seed.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { DafDataset } from '../src/daf-content/dataset.types';
import type { SentenceFile } from '../src/daf/seed/daf-sentence-seed';

const DATASET = join(__dirname, '..', 'content', 'daf', 'dib.json');
const TRANSLATIONS = join(
  __dirname,
  '..',
  'content',
  'daf',
  'translations.json',
);
const SENTENCES = join(__dirname, '..', 'content', 'daf', 'sentences.json');

async function main() {
  const dataset = JSON.parse(readFileSync(DATASET, 'utf8')) as DafDataset;

  // Tarjima fayli bo'lmasligi mumkin (birinchi yig'ishdan keyin, tarjima
  // hali yuritilmaganda) — bu xato emas, shunchaki tarjimasiz seed.
  const translations = existsSync(TRANSLATIONS)
    ? (JSON.parse(readFileSync(TRANSLATIONS, 'utf8')) as TranslationFile)
    : undefined;

  // `content/daf/a1-units.json` ATAYLAB o'qilmaydi: A1 xaritasi endi
  // `content/daf/a1/kurs.json` + `npm run daf:a1-seed` orqali boshqariladi,
  // eski DiB A1 bo'limlari esa nafaqaga chiqarilgan (manfiy order). Bu
  // faylni bu yerga uzatish `DafSeedService.seed()`ni rad ettiradi —
  // qarang shu servisning `assertA1NotProvided`i.

  // Gap fayli bo'lmasligi mumkin (9-taskdan oldin, ovoz hali yozilmagan
  // bosqichda) — bu ham xato emas, shunchaki gapsiz seed.
  const sentences = existsSync(SENTENCES)
    ? (JSON.parse(readFileSync(SENTENCES, 'utf8')) as SentenceFile)
    : undefined;

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  const service = new DafSeedService(prisma as unknown as PrismaService);
  console.log('Bazaga yozilmoqda…');
  const r = await service.seed(dataset, translations, undefined, sentences);

  console.log(`\nBo'lim:       ${r.units}`);
  console.log(`Dars:         ${r.lessons}`);
  console.log(`Lug'at:       ${r.lexemes}`);
  console.log(`Grammatika:   ${r.grammar}`);
  console.log(`Mashq:        ${r.exercises}`);
  if (r.retired > 0) console.log(`Nafaqaga:     ${r.retired}`);
  if (r.lexemesRemoved > 0) console.log(`O'chirilgan:  ${r.lexemesRemoved}`);
  console.log(
    `Tarjima:      ${r.translationsApplied}${translations ? '' : " (fayl yo'q)"}`,
  );
  console.log(`Gap:          ${r.sentences}${sentences ? '' : " (fayl yo'q)"}`);

  await prisma.$disconnect();
}

void main();
