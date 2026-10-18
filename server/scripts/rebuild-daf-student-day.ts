/**
 * Rebuilds DafStudentDay from DafAttempt (ADR-0111). Dry run by default
 * (prints the difference); --apply replaces the table in one transaction.
 *
 * The table is locked first (EXCLUSIVE): a concurrent recordAttempt waits
 * for the rebuild to commit and then adds its own increment, so no answer
 * is lost or counted twice. Run it after anything deletes or rewrites
 * DafAttempt rows, or after the points formula changes.
 */
import { run, dbEnvLabel } from './lib/check-cli';
import { DIFF_SQL, REBUILD_SQL } from './lib/daf-student-day-sql';
import { Prisma } from '@prisma/client';

const APPLY = process.argv.includes('--apply');

run(async (prisma) => {
  console.log('DB:', dbEnvLabel(), APPLY ? '(APPLY)' : '(dry run)');
  const before = await prisma.$queryRaw<unknown[]>(DIFF_SQL);
  console.log(`Farq oldin: ${before.length} qator`);
  if (!APPLY) return;
  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`LOCK TABLE "DafStudentDay" IN EXCLUSIVE MODE`;
      await tx.$executeRaw`DELETE FROM "DafStudentDay"`;
      await tx.$executeRaw(REBUILD_SQL);
    },
    {
      timeout: 120_000,
      maxWait: 10_000,
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    },
  );
  const after = await prisma.$queryRaw<unknown[]>(DIFF_SQL);
  console.log(`Farq keyin: ${after.length} qator`);
  if (after.length > 0) process.exitCode = 1;
});
