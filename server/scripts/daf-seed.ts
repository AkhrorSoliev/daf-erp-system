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
import type { A1UnitsFile } from '../src/daf/units/a1-units.types';

const DATASET = join(__dirname, '..', 'content', 'daf', 'dib.json');
const A1_UNITS = join(__dirname, '..', 'content', 'daf', 'a1-units.json');
const TRANSLATIONS = join(
  __dirname,
  '..',
  'content',
  'daf',
  'translations.json',
);

async function main() {
  const dataset = JSON.parse(readFileSync(DATASET, 'utf8')) as DafDataset;

  // Tarjima fayli bo'lmasligi mumkin (birinchi yig'ishdan keyin, tarjima
  // hali yuritilmaganda) — bu xato emas, shunchaki tarjimasiz seed.
  const translations = existsSync(TRANSLATIONS)
    ? (JSON.parse(readFileSync(TRANSLATIONS, 'utf8')) as TranslationFile)
    : undefined;

  // A1 bo'limlarining chegarasi qo'lda yozilgan. Fayl bo'lmasa seed eski
  // bob-bo'lim yo'lida ishlaydi — ya'ni fayl yo'qolgani jimgina noto'g'ri
  // bo'lim yasab qo'ymaydi, u shunchaki eski holatga qaytadi.
  const a1Units = existsSync(A1_UNITS)
    ? (JSON.parse(readFileSync(A1_UNITS, 'utf8')) as A1UnitsFile)
    : undefined;

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  const service = new DafSeedService(prisma as unknown as PrismaService);
  console.log('Bazaga yozilmoqda…');
  const r = await service.seed(dataset, translations, a1Units);

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
  if (!a1Units) console.log("A1 bo'lim fayli topilmadi — eski bob yo'li");

  await prisma.$disconnect();
}

void main();
