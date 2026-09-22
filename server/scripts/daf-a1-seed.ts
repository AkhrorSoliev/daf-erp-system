/**
 * A1 xaritasini bazaga tushiradi.
 *
 *   npm run daf:a1-seed
 *
 * Idempotent. Tushirishdan OLDIN xaritani tekshiradi — buzilgan fayl
 * bazaga yetib bormaydi.
 */
import 'dotenv/config';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { KursSeedService } from '../src/daf/kurs/kurs-seed.service';
import { validateKurs } from '../src/daf/kurs/kurs.validate';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { KursFile } from '../src/daf/kurs/kurs.types';

const PATH = join(__dirname, '..', 'content', 'daf', 'a1', 'kurs.json');

async function main(): Promise<void> {
  const file = JSON.parse(readFileSync(PATH, 'utf8')) as KursFile;

  const problems = validateKurs(file);
  if (problems.length > 0) {
    console.error(`Xarita buzuq — ${problems.length} ta muammo:`);
    problems.forEach((p) => console.error(`  - ${p}`));
    process.exit(1);
  }

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    const service = new KursSeedService(prisma as unknown as PrismaService);
    const report = await service.seed(file);
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
