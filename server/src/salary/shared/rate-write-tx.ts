import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';

// Wider than a bare version write: re-pricing reads the open month's accruals
// and posts a ledger row pair per changed lesson (ADR-0050).
const RATE_WRITE_TX = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 10_000,
  timeout: 30_000,
};

/** Thrown inside a preview's transaction to roll it back with its result. */
class PreviewRollback<T> extends Error {
  constructor(readonly result: T) {
    super('preview rollback');
  }
}

/**
 * One Serializable transaction for a rate write. With `dryRun` the work runs
 * in full and is then rolled back, so a preview reports exactly what the save
 * would do — there is no second, "estimate" code path to drift from it.
 */
export async function runRateWrite<T>(
  prisma: PrismaService,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
  dryRun = false,
): Promise<T> {
  try {
    return await prisma.$transaction(async (tx) => {
      const result = await work(tx);
      if (dryRun) throw new PreviewRollback(result);
      return result;
    }, RATE_WRITE_TX);
  } catch (err) {
    if (err instanceof PreviewRollback) return err.result as T;
    throw err;
  }
}

/** The same options, for a caller that opens its own transaction. */
export const rateWriteTxOptions = RATE_WRITE_TX;
