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

const DATASET = join(__dirname, '..', 'content', 'daf', 'dib.json');
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

  // `content/daf/a1-units.json` ATAYLAB o'qilmaydi: A1 xaritasi endi
  // `content/daf/a1/kurs.json` + `npm run daf:a1-seed` orqali boshqariladi,
  // eski DiB A1 bo'limlari esa nafaqaga chiqarilgan (manfiy order). Bu
  // faylni bu yerga uzatish `DafSeedService.seed()`ni rad ettiradi —
  // qarang shu servisning `assertA1NotProvided`i.

  // `content/daf/sentences.json` ATAYLAB o'qilmaydi: u A1 ning ESKI 20
  // bo'limlik tuzilishiga (order 1..20) qarab yasalgan, yangi qo'lda
  // chizilgan A1 (u01..u12) bilan aloqasi yo'q. Bu faylni shu yerga
  // uzatish `DafSeedService.seed()`ni rad ettiradi — qarang shu
  // servisning `assertSentencesNotProvided`i. Yangi tuzilish uchun gaplar
  // qayta yasalgach, ular `seedSentences`ni boshqa chaqiruvchidan
  // ishlatadi, bu skriptdan emas.

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  const service = new DafSeedService(prisma as unknown as PrismaService);
  console.log('Bazaga yozilmoqda…');
  const r = await service.seed(dataset, translations);

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

  await prisma.$disconnect();
}

void main();
