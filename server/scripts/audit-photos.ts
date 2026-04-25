/**
 * Audit all Student / User photo URLs — check how many actually resolve in R2.
 *
 * Usage (from server/ directory):
 *   railway run npx ts-node scripts/audit-photos.ts
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function probe(url: string): Promise<number | string> {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return res.status;
  } catch (e: any) {
    return `err:${e?.message ?? e}`;
  }
}

async function audit(entity: 'student' | 'user') {
  const rows =
    entity === 'student'
      ? await prisma.student.findMany({
          where: { photo: { not: null } },
          select: { id: true, firstName: true, lastName: true, photo: true },
        })
      : await prisma.user.findMany({
          where: { photo: { not: null } },
          select: { id: true, firstName: true, lastName: true, photo: true },
        });

  console.log(`\n=== ${entity.toUpperCase()} (${rows.length} with photo) ===`);

  const counts = { ok: 0, gone: 0, error: 0 };
  const broken: { id: number; name: string; status: number | string }[] = [];

  // concurrency cap
  const BATCH = 8;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(async (r) => {
        const status = await probe(r.photo!);
        return { ...r, status };
      }),
    );
    for (const r of results) {
      if (r.status === 200) counts.ok++;
      else if (r.status === 404) {
        counts.gone++;
        broken.push({
          id: r.id,
          name: `${r.firstName} ${r.lastName}`,
          status: r.status,
        });
      } else {
        counts.error++;
        broken.push({
          id: r.id,
          name: `${r.firstName} ${r.lastName}`,
          status: r.status,
        });
      }
    }
  }

  console.log(`  OK (200):       ${counts.ok}`);
  console.log(`  GONE (404):     ${counts.gone}`);
  console.log(`  ERROR/OTHER:    ${counts.error}`);

  if (broken.length > 0) {
    console.log(`\n  Broken/missing (first 20):`);
    for (const b of broken.slice(0, 20)) {
      console.log(`    #${b.id} ${b.name} → ${b.status}`);
    }
  }
}

async function main() {
  console.log(`DB host: ${new URL(process.env.DATABASE_URL ?? '').host}`);
  await audit('student');
  await audit('user');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
