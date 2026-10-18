/**
 * One-time badge backfill for students who practised before S2 (spec S2 2.4,
 * ADR-0115). Run once after the deploy that applies 20261018220000:
 *
 *   railway run --service caring-courage --environment production \
 *     npx ts-node --transpile-only scripts/daf-badges-backfill.ts \
 *     [--expect=<N>] [--apply]
 *
 * Dry run by default, on a read-only connection (checked; it stops
 * otherwise): it lists every badge it would give and the count N. Then
 * `--apply --expect=<N>`: a fresh scan must give the same N, else nothing is
 * written. Writes go through `grantBadges` only (ON CONFLICT DO NOTHING), so
 * a repeat adds nothing. A student whose write fails is logged; the run goes
 * on and exits non-zero. Importing this file runs nothing.
 */
import { PrismaService } from '../src/prisma/prisma.service';
import { grantBadges } from '../src/daf/nishon/nishon-berish';
import { printHeader } from './lib/check-cli';
import { parseApplyExpectArgs, UsageError } from './lib/apply-expect-args';
import {
  berishRejasi,
  type BerishRejasi,
  type OquvchiHolati,
} from './lib/daf-badges-backfill-plan';

const USAGE =
  'Usage: daf-badges-backfill.ts [--expect=<N>] [--apply]  (--apply requires --expect=<N>)';

function readOnlyUrl(url: string): string {
  const u = new URL(url);
  u.searchParams.set('options', '-c default_transaction_read_only=on');
  return u.toString();
}

async function scan(
  prisma: PrismaService,
  hozir: Date,
): Promise<BerishRejasi[]> {
  const [kunlar, sozlar, olinganlar] = await Promise.all([
    prisma.$queryRaw<
      { studentId: number; companyId: number; tage: string[] }[]
    >`
      SELECT "studentId", MIN("companyId")::int AS "companyId",
             array_agg(DISTINCT to_char(day, 'YYYY-MM-DD')) AS tage
      FROM "DafStudentDay" WHERE attempts > 0
      GROUP BY "studentId"`,
    prisma.$queryRaw<{ studentId: number; companyId: number; n: number }[]>`
      SELECT "studentId", MIN("companyId")::int AS "companyId", COUNT(*)::int AS n
      FROM "DafLexemeState" WHERE "correctCount" >= 1
      GROUP BY "studentId"`,
    prisma.dafStudentBadge.findMany({ select: { studentId: true, key: true } }),
  ]);

  const holat = new Map<number, OquvchiHolati>();
  const ol = (studentId: number, companyId: number): OquvchiHolati => {
    let h = holat.get(studentId);
    if (!h) {
      h = { studentId, companyId, tage: [], woerter: 0, olingan: new Set() };
      holat.set(studentId, h);
    }
    return h;
  };
  for (const k of kunlar) ol(k.studentId, k.companyId).tage = k.tage;
  for (const s of sozlar) ol(s.studentId, s.companyId).woerter = s.n;
  for (const b of olinganlar) holat.get(b.studentId)?.olingan.add(b.key);

  return [...holat.values()]
    .sort((a, b) => a.studentId - b.studentId)
    .map((h) => berishRejasi(h, hozir))
    .filter((r): r is BerishRejasi => r !== null);
}

const count = (rejalar: BerishRejasi[]) =>
  rejalar.reduce((s, r) => s + r.yangi.length, 0);

async function main() {
  const { apply: APPLY, expect } = parseApplyExpectArgs(
    process.argv.slice(2),
    USAGE,
  );
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  if (!APPLY) process.env.DATABASE_URL = readOnlyUrl(url);

  const prisma = new PrismaService();
  try {
    printHeader(`DaF badges backfill — ${APPLY ? 'APPLY' : 'DRY RUN'}`);
    if (!APPLY) {
      const [ro] = await prisma.$queryRaw<
        { default_transaction_read_only: string }[]
      >`SHOW default_transaction_read_only`;
      if (ro?.default_transaction_read_only !== 'on') {
        throw new Error('Read-only connection was not established — stopping');
      }
    }

    const hozir = new Date();
    const rejalar = await scan(prisma, hozir);
    for (const r of rejalar) {
      for (const key of r.yangi) {
        console.log(
          `badge\t${r.studentId}\t${key}\t${r.earnedAt[key].toISOString()}`,
        );
      }
    }
    const n = count(rejalar);
    console.log(`\nstudents: ${rejalar.length}`);
    console.log(`badges: ${n}`);
    if (!APPLY) return;

    if (expect !== n) {
      throw new UsageError(
        `Scan found ${n} badge(s) but --expect=${expect}. Nothing was written; review a fresh dry run and pass its count.`,
      );
    }
    const again = await scan(prisma, hozir);
    if (count(again) !== n) {
      throw new UsageError(
        `A second scan found ${count(again)} badge(s), not ${n}. Nothing was written; run the dry run again.`,
      );
    }

    let berildi = 0;
    let failed = 0;
    for (const r of again) {
      try {
        const yangi = await grantBadges(
          prisma,
          r.studentId,
          r.companyId,
          r.sharoit,
          r.earnedAt,
        );
        berildi += yangi.length;
      } catch (err) {
        failed += 1;
        console.error(
          `FAILED ${r.studentId}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
    // A session finishing meanwhile may have given one already: fewer is fine.
    console.log(`Given ${berildi} of ${n}. Failed students: ${failed}.`);
    if (failed > 0) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err instanceof UsageError ? err.message : err);
    process.exitCode = 1;
  });
}
