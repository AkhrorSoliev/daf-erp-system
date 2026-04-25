/**
 * Diagnose photo state across Student and User tables.
 *
 * Reports:
 *   - count with/without photo
 *   - breakdown by URL scheme/host
 *   - samples of each category
 *   - optionally probes a random sample of URLs to see if they resolve
 *
 * Usage (from server/ directory):
 *   npx ts-node scripts/diagnose-photos.ts           # report only
 *   npx ts-node scripts/diagnose-photos.ts --probe   # also HEAD-check URLs
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
const PROBE = process.argv.includes('--probe');

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '<invalid>';
  }
}

async function probeUrl(url: string): Promise<number | string> {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return res.status;
  } catch (e: any) {
    return `error: ${e?.message ?? e}`;
  }
}

async function report(
  entityName: string,
  withPhoto: { id: number; photo: string | null }[],
  totalRows: number,
) {
  console.log(`\n=== ${entityName} ===`);
  console.log(`Total rows: ${totalRows}`);
  console.log(`With photo: ${withPhoto.length}`);
  console.log(`Without photo (null): ${totalRows - withPhoto.length}`);

  const byHost = new Map<string, number>();
  for (const row of withPhoto) {
    const h = row.photo ? hostOf(row.photo) : '<null>';
    byHost.set(h, (byHost.get(h) ?? 0) + 1);
  }

  console.log(`\nBy host:`);
  for (const [h, n] of [...byHost.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${h}: ${n}`);
  }

  console.log(`\nSample URLs (up to 5):`);
  for (const row of withPhoto.slice(0, 5)) {
    console.log(`  #${row.id}: ${row.photo}`);
  }

  if (PROBE && withPhoto.length > 0) {
    const sample = withPhoto.slice(0, Math.min(5, withPhoto.length));
    console.log(`\nProbing ${sample.length} URL(s)...`);
    for (const row of sample) {
      if (!row.photo) continue;
      const status = await probeUrl(row.photo);
      console.log(`  #${row.id} [${status}] ${row.photo}`);
    }
  }
}

async function main() {
  const studentTotal = await prisma.student.count();
  const studentsWithPhoto = await prisma.student.findMany({
    where: { photo: { not: null } },
    select: { id: true, photo: true },
  });
  await report('Student', studentsWithPhoto, studentTotal);

  const userTotal = await prisma.user.count();
  const usersWithPhoto = await prisma.user.findMany({
    where: { photo: { not: null } },
    select: { id: true, photo: true },
  });
  await report('User', usersWithPhoto, userTotal);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
