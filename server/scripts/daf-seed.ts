/**
 * `dib.json` ni bazaga tushiradi.
 *
 *   npm run daf:seed
 *
 * Idempotent: qayta yuritish yangilaydi, takrorlamaydi. Manbadan yo'qolgan
 * mashq o'chirilmaydi — nafaqaga chiqariladi.
 */
import 'dotenv/config';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { DafSeedService } from '../src/daf/seed/daf-seed.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { DafDataset } from '../src/daf-content/dataset.types';

const DATASET = join(__dirname, '..', 'content', 'daf', 'dib.json');

async function main() {
  const dataset = JSON.parse(readFileSync(DATASET, 'utf8')) as DafDataset;

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  const service = new DafSeedService(prisma as unknown as PrismaService);
  console.log('Bazaga yozilmoqda…');
  const r = await service.seed(dataset);

  console.log(`\nBo'lim:       ${r.units}`);
  console.log(`Lug'at:       ${r.lexemes}`);
  console.log(`Grammatika:   ${r.grammar}`);
  console.log(`Mashq:        ${r.exercises}`);
  if (r.retired > 0) console.log(`Nafaqaga:     ${r.retired}`);
  if (r.lexemesRemoved > 0) console.log(`O'chirilgan:  ${r.lexemesRemoved}`);

  await prisma.$disconnect();
}

void main();
