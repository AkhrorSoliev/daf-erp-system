/**
 * Reverse a backfill batch written by `backfill-uncovered-attendances.ts`.
 *
 * Takes the batch ID printed at the end of the backfill run and undoes
 * every SINGLE_UNCOVERED LESSON_DEDUCTION (and its linked
 * LESSON_CONSUMPTION audit row) that belongs to that batch. Uses the
 * standard `TransactionsWriteService.reverseTransaction()` pipeline so
 * the ledger stays append-only — original rows get `reversedAt` markers
 * and inverse rows restore the student's balance.
 *
 * Rows tagged with a different `metadata.backfillBatch`, or untagged
 * SINGLE_UNCOVERED rows from live attendance saves, are left alone.
 *
 * Safe to re-run: rows already reversed are skipped.
 *
 * Usage (from server/ directory):
 *   # Preview only:
 *   npx ts-node scripts/reverse-backfill-uncovered.ts --batch-id=<id> --dry-run
 *
 *   # Apply:
 *   npx ts-node scripts/reverse-backfill-uncovered.ts --batch-id=<id>
 */
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as dotenv from 'dotenv';
import { AppModule } from '../src/app.module';
import { TransactionsService } from '../src/transactions/transactions.service';
import { PrismaService } from '../src/prisma/prisma.service';

dotenv.config();

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const arg = (name: string): string | undefined =>
  argv.find((a) => a.startsWith(`${name}=`))?.split('=', 2)[1];
const BATCH_ID = arg('--batch-id');

if (!BATCH_ID) {
  console.error('--batch-id is required');
  process.exit(1);
}

class DryRunAbort extends Error {
  constructor() {
    super('DRY_RUN_ABORT');
  }
}

async function main() {
  const logger = new Logger('ReverseBackfill');
  logger.log(`DB host: ${new URL(process.env.DATABASE_URL ?? '').host}`);
  logger.log(`Mode: ${DRY_RUN ? 'DRY RUN (no commits)' : 'APPLY'}`);
  logger.log(`Batch ID: ${BATCH_ID}`);

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  const transactions = app.get(TransactionsService);
  const prisma = app.get(PrismaService);

  try {
    // Group by student so the per-student summary mirrors the backfill log.
    const rows = await prisma.$queryRaw<
      { studentId: number; deductionIds: string[]; count: bigint }[]
    >`
      SELECT
        "studentId",
        ARRAY_AGG(id ORDER BY "createdAt" DESC) AS "deductionIds",
        COUNT(*)::bigint AS count
      FROM "Transaction"
      WHERE type = 'LESSON_DEDUCTION'
        AND "reversedAt" IS NULL
        AND metadata->>'mode' = 'SINGLE_UNCOVERED'
        AND metadata->>'backfillBatch' = ${BATCH_ID}
      GROUP BY "studentId"
      ORDER BY "studentId" ASC
    `;

    if (rows.length === 0) {
      logger.log(`No active SINGLE_UNCOVERED rows found for batch "${BATCH_ID}". Nothing to reverse.`);
      return;
    }

    const totalRows = rows.reduce((acc, r) => acc + Number(r.count), 0);
    logger.log(
      `Found ${totalRows} SINGLE_UNCOVERED deduction(s) across ${rows.length} student(s) in this batch.`,
    );

    let reversedDeductions = 0;
    let reversedConsumptions = 0;
    let errors = 0;

    for (const r of rows) {
      const studentId = r.studentId;
      const before = await prisma.student.findUnique({
        where: { id: studentId },
        select: { firstName: true, lastName: true, balance: true },
      });
      if (!before) {
        logger.warn(`Student ${studentId} not found — skipping.`);
        continue;
      }

      try {
        const state: { after: { balance: number } | null } = { after: null };
        let dedReversedHere = 0;
        let consReversedHere = 0;

        const runTx = async (tx: Prisma.TransactionClient) => {
          // Reverse the deduction. Each reverse restores balance by the
          // deduction's amount (the negative becomes positive).
          for (const id of r.deductionIds) {
            // Find the linked consumption — same attendanceId, active row.
            const dedRow = await tx.transaction.findUnique({
              where: { id },
              select: { attendanceId: true, reversedAt: true },
            });
            if (!dedRow || dedRow.reversedAt) continue;

            await transactions.reverseTransaction(
              id,
              { reason: `Backfill reversal (batch ${BATCH_ID})` },
              tx,
            );
            dedReversedHere += 1;

            if (dedRow.attendanceId) {
              const cons = await tx.transaction.findFirst({
                where: {
                  attendanceId: dedRow.attendanceId,
                  type: 'LESSON_CONSUMPTION',
                  reversedAt: null,
                },
                select: { id: true },
              });
              if (cons) {
                await transactions.reverseLessonConsumption(
                  cons.id,
                  { reason: `Backfill reversal (batch ${BATCH_ID})` },
                  tx,
                );
                consReversedHere += 1;
              }
            }
          }

          state.after = await tx.student.findUnique({
            where: { id: studentId },
            select: { balance: true },
          });
          if (DRY_RUN) throw new DryRunAbort();
        };

        try {
          await prisma.$transaction(runTx, {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            maxWait: 30_000,
            timeout: 120_000,
          });
        } catch (err) {
          if (!(err instanceof DryRunAbort)) throw err;
        }

        reversedDeductions += dedReversedHere;
        reversedConsumptions += consReversedHere;
        const finalBal = state.after?.balance ?? before.balance;
        const delta = finalBal - before.balance;
        const name = `${before.firstName} ${before.lastName}`.trim();
        logger.log(
          `#${studentId} ${name}: reversed ${dedReversedHere} deduction(s) + ${consReversedHere} consumption(s) | balance ${before.balance} → ${finalBal} (${delta >= 0 ? '+' : ''}${delta})`,
        );
      } catch (err) {
        errors += 1;
        logger.error(
          `Student #${studentId} failed: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    logger.log('');
    logger.log(
      `Summary: reversed ${reversedDeductions} deduction(s), ${reversedConsumptions} consumption(s) | errors=${errors}`,
    );
    if (DRY_RUN) {
      logger.log('Dry run — all changes rolled back.');
    } else {
      logger.log('Reversal complete.');
    }
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
