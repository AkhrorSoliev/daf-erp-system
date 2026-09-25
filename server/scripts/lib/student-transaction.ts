/**
 * One student's migration, in its own Serializable transaction.
 *
 * A rehearsal runs every step against real data and then throws, so Postgres
 * discards the whole transaction: the operator sees exactly which students
 * would fail, and with what totals, while nothing is written. The migration
 * code has never run end to end on production data before, and a rehearsal
 * is the only way to exercise it there without touching a balance.
 */
import { Prisma } from '@prisma/client';

class RehearsalRollback<T> extends Error {
  constructor(readonly result: T) {
    super('rehearsal: rolled back on purpose');
  }
}

interface TransactionRunner {
  $transaction<R>(
    fn: (tx: Prisma.TransactionClient) => Promise<R>,
    options?: {
      isolationLevel?: Prisma.TransactionIsolationLevel;
      timeout?: number;
      maxWait?: number;
    },
  ): Promise<R>;
}

export async function runStudentTransaction<T>(
  prisma: TransactionRunner,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
  opts: { rehearse: boolean },
): Promise<T> {
  try {
    return await prisma.$transaction(
      async (tx) => {
        const result = await work(tx);
        if (opts.rehearse) throw new RehearsalRollback(result);
        return result;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 30_000,
        maxWait: 15_000,
      },
    );
  } catch (err) {
    if (opts.rehearse && err instanceof RehearsalRollback) {
      return err.result as T;
    }
    throw err;
  }
}
