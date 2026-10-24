/**
 * Links old payment corrections (spec B4 §4.8, §5.10): the NEW payment of an
 * amount (or method) correction gets `correctsPaymentId` = the payment it
 * corrected. Corrections made after the column existed are linked by the
 * server itself; this covers the ones before.
 *
 *   railway run --service caring-courage --environment production \
 *     npx ts-node --transpile-only scripts/link-payment-corrections.ts \
 *     [--expect=<N>] [--apply]
 *
 * Two steps. First the dry run (no --apply): the connection is read-only (the
 * script checks that it took effect and stops otherwise); it lists every link
 * it would write and every correction it could not pair (with the reason), then
 * the count N. Then `--apply --expect=<N>`: it scans again and stops BEFORE
 * writing if the count differs. `--apply` without `--expect` is refused, as is
 * any unknown flag.
 *
 * A pair is written only when exactly one new payment fits (same student, made
 * within 10 minutes after the reversal, note naming the old amount, not yet
 * linked). One that fails is logged and skipped; the run goes on, ends with a
 * non-zero exit code, and can be repeated (linked payments are skipped).
 */
import { PrismaService } from '../src/prisma/prisma.service';
import { printHeader } from './lib/check-cli';
import { parseApplyExpectArgs, UsageError } from './lib/apply-expect-args';
import {
  matchCorrections,
  type NewCandidate,
  type ReversedCandidate,
} from './lib/payment-correction-links';

const USAGE =
  'Usage: link-payment-corrections.ts [--expect=<N>] [--apply]  (--apply requires --expect=<N>)';

function readOnlyUrl(url: string): string {
  const u = new URL(url);
  u.searchParams.set('options', '-c default_transaction_read_only=on');
  return u.toString();
}

async function scan(prisma: PrismaService) {
  const rows = await prisma.payment.findMany({
    where: { status: 'REVERSED', correctedBy: { is: null } },
    select: {
      id: true,
      studentId: true,
      amount: true,
      transactions: {
        where: { type: 'PAYMENT', reversedTransactionId: null },
        take: 1,
        select: {
          reversalEntries: {
            take: 1,
            orderBy: { createdAt: 'desc' },
            select: { createdAt: true, description: true },
          },
        },
      },
    },
  });
  const reversed: ReversedCandidate[] = [];
  for (const p of rows) {
    const reversal = p.transactions[0]?.reversalEntries[0];
    if (!reversal) continue;
    reversed.push({
      id: p.id,
      studentId: p.studentId,
      amount: p.amount,
      reversedAt: reversal.createdAt,
      reversalDescription: reversal.description,
    });
  }
  const fresh: NewCandidate[] = await prisma.payment.findMany({
    where: {
      correctsPaymentId: null,
      note: { startsWith: "To'g'rilangan to'lov (avvalgi summa: " },
    },
    select: { id: true, studentId: true, createdAt: true, note: true },
  });
  return matchCorrections(reversed, fresh);
}

async function main() {
  // Refuse a bad command line before anything connects.
  const { apply: APPLY, expect } = parseApplyExpectArgs(
    process.argv.slice(2),
    USAGE,
  );
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  if (!APPLY) process.env.DATABASE_URL = readOnlyUrl(url);

  const prisma = new PrismaService();
  try {
    printHeader(`Link payment corrections — ${APPLY ? 'APPLY' : 'DRY RUN'}`);
    if (!APPLY) {
      const [ro] = await prisma.$queryRaw<
        { default_transaction_read_only: string }[]
      >`SHOW default_transaction_read_only`;
      if (ro?.default_transaction_read_only !== 'on') {
        throw new Error('Read-only connection was not established — stopping');
      }
    }

    const { links, unlinked } = await scan(prisma);
    for (const l of links) console.log(`link\t${l.oldId} → ${l.newId}`);
    for (const u of unlinked) {
      console.log(`unlinked\t${u.oldId}\t${u.reason}`);
    }
    console.log(`\nlinks: ${links.length}`);
    console.log(`unlinked: ${unlinked.length}`);
    if (!APPLY) return;

    // What was reviewed is what gets written.
    if (expect !== links.length) {
      throw new UsageError(
        `Scan found ${links.length} link(s) but --expect=${expect}. Nothing was written; review a fresh dry run and pass its count.`,
      );
    }
    const again = await scan(prisma);
    if (again.links.length !== links.length) {
      throw new UsageError(
        `A second scan found ${again.links.length} link(s), not ${links.length}. Nothing was written; run the dry run again.`,
      );
    }

    let linked = 0;
    let skipped = 0;
    let failed = 0;
    for (const l of again.links) {
      try {
        const { count } = await prisma.payment.updateMany({
          where: { id: l.newId, correctsPaymentId: null },
          data: { correctsPaymentId: l.oldId },
        });
        if (count === 0) {
          skipped += 1;
          console.log(`skipped (already linked) ${l.newId}`);
        } else {
          linked += 1;
        }
      } catch (err) {
        failed += 1;
        console.error(
          `FAILED ${l.oldId} → ${l.newId}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
    console.log(`Linked ${linked}. Skipped ${skipped}. Failed ${failed}.`);
    if (failed > 0) {
      console.error(
        `${failed} link(s) failed — repeat the same command to retry them (linked payments are skipped).`,
      );
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof UsageError ? err.message : err);
  process.exitCode = 1;
});
