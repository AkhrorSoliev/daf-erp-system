/**
 * Backfill SINGLE_UNCOVERED deductions for legacy unpaid attendances.
 *
 * Before the negative-balance change shipped, the billing service silently
 * no-op'd when a student attended a lesson with insufficient balance — no
 * LESSON_DEDUCTION, no LESSON_CONSUMPTION, no SalaryAccrual was written.
 * The student's real debt was nowhere in the ledger; the UI just capped
 * the displayed "qarz" at one lesson's worth and hid the rest.
 *
 * This script catches up: for every historical PRESENT/LATE/ABSENT
 * attendance (optionally filtered by `--from-date`) that has no active
 * LESSON_CONSUMPTION, it delegates to `LessonBillingService.bill()` —
 * the same code path normal attendance uses. The result is real numbers
 * across the board (balance reflects every attended lesson in scope).
 *
 * Every SINGLE_UNCOVERED row written by this script is tagged in metadata
 * with `backfillBatch: <batchId>` so a follow-up `reverse-backfill.ts`
 * run can find and undo precisely the rows this batch produced — leaving
 * any unrelated SINGLE_UNCOVERED writes (from live attendance saves)
 * untouched.
 *
 * Side effects:
 *   - Student.balance will go (potentially deeply) negative for students
 *     with many unpaid attendances in scope.
 *   - SalaryAccrual rows are NOT written for uncovered lessons (B.1 still
 *     preserved via `salaryDeferred=true`). When a payment lands later,
 *     the existing FIFO settlement logic in
 *     `processRetroactiveBillingForStudent` accrues them automatically.
 *   - No Telegram notifications fire (script runs outside the
 *     `attendance.student.recorded` event flow on purpose — we don't want
 *     to spam every student with a notification per historical lesson).
 *
 * Safe to re-run. The LESSON_CONSUMPTION idempotency guard inside `bill()`
 * short-circuits already-billed attendances, so a second run is a no-op.
 *
 * Usage (from server/ directory):
 *   # Preview only (rolls back at the end of each student tx):
 *   npx ts-node scripts/backfill-uncovered-attendances.ts --dry-run
 *
 *   # Limit to lessons on/after a specific date (default: all history):
 *   npx ts-node scripts/backfill-uncovered-attendances.ts --dry-run --from-date=2026-05-01
 *
 *   # Single student / single company:
 *   npx ts-node scripts/backfill-uncovered-attendances.ts --dry-run --student=12345
 *   npx ts-node scripts/backfill-uncovered-attendances.ts --company=1
 *
 *   # Apply for real:
 *   npx ts-node scripts/backfill-uncovered-attendances.ts --from-date=2026-05-01
 */
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as dotenv from 'dotenv';
import { AppModule } from '../src/app.module';
import { LessonBillingService } from '../src/billing/lesson-billing.service';
import { PrismaService } from '../src/prisma/prisma.service';

dotenv.config();

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const arg = (name: string): string | undefined =>
  argv.find((a) => a.startsWith(`${name}=`))?.split('=', 2)[1];
const STUDENT_ID = arg('--student') ? Number(arg('--student')) : undefined;
const COMPANY_ID = arg('--company') ? Number(arg('--company')) : undefined;
const FROM_DATE_STR = arg('--from-date');
const FROM_DATE = FROM_DATE_STR ? new Date(`${FROM_DATE_STR}T00:00:00.000Z`) : undefined;
const BATCH_ID = arg('--batch-id') ?? new Date().toISOString();

class DryRunAbort extends Error {
  constructor() {
    super('DRY_RUN_ABORT');
  }
}

async function main() {
  const logger = new Logger('BackfillUncovered');
  logger.log(`DB host: ${new URL(process.env.DATABASE_URL ?? '').host}`);
  logger.log(`Mode: ${DRY_RUN ? 'DRY RUN (no commits)' : 'APPLY'}`);
  logger.log(`Batch ID: ${BATCH_ID}`);
  if (STUDENT_ID) logger.log(`Scope: single student #${STUDENT_ID}`);
  if (COMPANY_ID) logger.log(`Scope: company ${COMPANY_ID}`);
  if (FROM_DATE) logger.log(`From date: ${FROM_DATE.toISOString().slice(0, 10)}`);

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  const billing = app.get(LessonBillingService);
  const prisma = app.get(PrismaService);

  try {
    const candidates = await prisma.$queryRaw<
      { studentId: number; companyId: number; unpaidCount: bigint }[]
    >`
      SELECT a."studentId", a."companyId", COUNT(*)::bigint AS "unpaidCount"
      FROM "Attendance" a
      WHERE a.status::text IN ('PRESENT', 'LATE', 'ABSENT')
        AND NOT EXISTS (
          SELECT 1 FROM "Transaction" t
          WHERE t."attendanceId" = a.id
            AND t.type = 'LESSON_CONSUMPTION'
            AND t."reversedAt" IS NULL
        )
        ${STUDENT_ID ? Prisma.sql`AND a."studentId" = ${STUDENT_ID}` : Prisma.empty}
        ${COMPANY_ID ? Prisma.sql`AND a."companyId" = ${COMPANY_ID}` : Prisma.empty}
        ${FROM_DATE ? Prisma.sql`AND a.date >= ${FROM_DATE}` : Prisma.empty}
      GROUP BY a."studentId", a."companyId"
      ORDER BY a."studentId" ASC
    `;

    if (candidates.length === 0) {
      logger.log('No unpaid attendances found. Nothing to backfill.');
      return;
    }

    const totalUnpaid = candidates.reduce(
      (acc, c) => acc + Number(c.unpaidCount),
      0,
    );
    logger.log(
      `Found ${candidates.length} student(s) with ${totalUnpaid} unpaid attendance(s) in scope.`,
    );

    let processed = 0;
    let billed = 0;
    let skipped = 0;
    let errors = 0;

    for (const candidate of candidates) {
      processed += 1;
      const studentId = candidate.studentId;
      const companyId = candidate.companyId;
      const expected = Number(candidate.unpaidCount);

      try {
        const before = await prisma.student.findUnique({
          where: { id: studentId },
          select: { firstName: true, lastName: true, balance: true },
        });
        if (!before) {
          skipped += 1;
          logger.warn(`Student ${studentId} not found — skipping.`);
          continue;
        }

        let result: { billedAttendances: number };
        let after: { balance: number };

        const runTx = async (tx: Prisma.TransactionClient) => {
          result = await billing.processRetroactiveBillingForStudent(tx, {
            studentId,
            companyId,
            fromDate: FROM_DATE,
          });
          // Tag every SINGLE_UNCOVERED row this student just produced with
          // the batch id so the reverse script can find them precisely.
          // jsonb_set is idempotent — re-tagging an already-tagged row is
          // harmless (overwrite with the same value).
          if (result.billedAttendances > 0) {
            await tx.$executeRaw`
              UPDATE "Transaction"
              SET metadata = jsonb_set(
                COALESCE(metadata, '{}'::jsonb),
                '{backfillBatch}',
                to_jsonb(${BATCH_ID}::text)
              )
              WHERE "studentId" = ${studentId}
                AND type = 'LESSON_DEDUCTION'
                AND "reversedAt" IS NULL
                AND metadata->>'mode' = 'SINGLE_UNCOVERED'
                AND (metadata->>'backfillBatch') IS NULL
            `;
          }
          const stu = await tx.student.findUnique({
            where: { id: studentId },
            select: { balance: true },
          });
          after = stu ?? { balance: before.balance };
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

        billed += result!.billedAttendances;
        const delta = after!.balance - before.balance;
        const name = `${before.firstName} ${before.lastName}`.trim();
        logger.log(
          `#${studentId} ${name}: ${result!.billedAttendances}/${expected} billed | balance ${before.balance} → ${after!.balance} (${delta >= 0 ? '+' : ''}${delta})`,
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
      `Summary: processed=${processed} | billed=${billed} attendances | skipped=${skipped} | errors=${errors}`,
    );
    logger.log(`Batch ID: ${BATCH_ID}`);
    if (DRY_RUN) {
      logger.log('Dry run — all changes rolled back. Re-run without --dry-run to apply.');
    } else {
      logger.log('Backfill complete. To reverse this batch, run:');
      logger.log(`  npx ts-node scripts/reverse-backfill-uncovered.ts --batch-id="${BATCH_ID}"`);
    }
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
