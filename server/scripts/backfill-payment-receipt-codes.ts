/**
 * Gives every payment without a receipt code its R-YYYY-NNNNN (spec B4 §4.7,
 * §5.10). New payments get theirs when they commit; this covers the old ones.
 *
 *   railway run --service caring-courage --environment production \
 *     npx ts-node --transpile-only scripts/backfill-payment-receipt-codes.ts \
 *     [--expect=<N>] [--apply]
 *
 * Two steps. First the dry run (no --apply): the connection is read-only (the
 * script checks that it took effect and stops otherwise); it prints, per
 * Tashkent year, how many payments get a code and the first/last one, then the
 * count N. Then `--apply --expect=<N>`: it scans again and stops BEFORE
 * writing if the count differs. `--apply` without `--expect` is refused, as is
 * any unknown flag.
 *
 * Payments are numbered oldest first, each in its own transaction, after the
 * year's global highest code. One that fails is logged and skipped; the run
 * goes on, ends with a non-zero exit code, and can be repeated (payments that
 * already have a code are skipped).
 */
import { PrismaService } from '../src/prisma/prisma.service';
import { allocatePaymentReceiptCode } from '../src/receipts/receipt-code';
import { tashkentMonthKey } from '../src/common/date/tashkent';
import { printHeader } from './lib/check-cli';
import { parseApplyExpectArgs, UsageError } from './lib/apply-expect-args';
import { previewReceiptCodes } from './lib/receipt-code-plan';

const USAGE =
  'Usage: backfill-payment-receipt-codes.ts [--expect=<N>] [--apply]  (--apply requires --expect=<N>)';

function readOnlyUrl(url: string): string {
  const u = new URL(url);
  u.searchParams.set('options', '-c default_transaction_read_only=on');
  return u.toString();
}

async function scan(prisma: PrismaService) {
  const missing = await prisma.payment.findMany({
    where: { receiptCode: null },
    select: { id: true, createdAt: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  const prefixes = new Set(
    missing.map((p) => `R-${tashkentMonthKey(p.createdAt).slice(0, 4)}-`),
  );
  const lastByPrefix = new Map<string, string | null>();
  for (const prefix of prefixes) {
    const last = await prisma.payment.findFirst({
      where: { receiptCode: { startsWith: prefix } },
      orderBy: { receiptCode: 'desc' },
      select: { receiptCode: true },
    });
    lastByPrefix.set(prefix, last?.receiptCode ?? null);
  }
  return { missing, preview: previewReceiptCodes(missing, lastByPrefix) };
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
    printHeader(
      `Backfill payment receipt codes — ${APPLY ? 'APPLY' : 'DRY RUN'}`,
    );
    if (!APPLY) {
      const [ro] = await prisma.$queryRaw<
        { default_transaction_read_only: string }[]
      >`SHOW default_transaction_read_only`;
      if (ro?.default_transaction_read_only !== 'on') {
        throw new Error('Read-only connection was not established — stopping');
      }
    }

    const { missing, preview } = await scan(prisma);
    for (const r of preview) {
      console.log(`${r.prefix}\t${r.count}\t${r.first} … ${r.last}`);
    }
    console.log(`\nmissing: ${missing.length}`);
    if (!APPLY) return;

    // What was reviewed is what gets written.
    if (expect !== missing.length) {
      throw new UsageError(
        `Scan found ${missing.length} payment(s) but --expect=${expect}. Nothing was written; review a fresh dry run and pass its count.`,
      );
    }
    const again = await scan(prisma);
    if (again.missing.length !== missing.length) {
      throw new UsageError(
        `A second scan found ${again.missing.length} payment(s), not ${missing.length}. Nothing was written; run the dry run again.`,
      );
    }

    let assigned = 0;
    let failed = 0;
    for (const p of again.missing) {
      try {
        if (await allocatePaymentReceiptCode(prisma, p.id)) assigned += 1;
      } catch (err) {
        failed += 1;
        console.error(
          `FAILED ${p.id}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
    console.log(`assigned: ${assigned}`);
    if (failed > 0) {
      console.error(
        `${failed} payment(s) failed — repeat the same command to retry them (payments with a code are skipped).`,
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
