/**
 * One student's migration, in its own Serializable transaction.
 *
 * A rehearsal runs every step against real data and then throws, so Postgres
 * discards the whole transaction: the operator sees exactly which students
 * would fail, and with what totals, while nothing is written. The migration
 * code has never run end to end on production data before, and a rehearsal
 * is the only way to exercise it there without touching a balance.
 *
 * A write conflict is retried. Postgres abandons a Serializable transaction
 * when another one writes the same rows at the same moment — typically a
 * teacher's balance, which every attendance save and every online payment
 * that settles a lesson also moves. The first daytime rehearsal lost one
 * student that way. Postgres has already discarded the failed attempt and
 * every step of a student's migration is idempotent, so running the whole
 * transaction again is safe. Any other error is reported, never retried.
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

/** Prisma's code for "write conflict or deadlock, please retry". */
const WRITE_CONFLICT = 'P2034';
const MAX_ATTEMPTS = 3;

function isWriteConflict(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: unknown }).code === WRITE_CONFLICT
  );
}

async function runOnce<T>(
  prisma: TransactionRunner,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
  rehearse: boolean,
): Promise<T> {
  try {
    return await prisma.$transaction(
      async (tx) => {
        const result = await work(tx);
        if (rehearse) throw new RehearsalRollback(result);
        return result;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 30_000,
        maxWait: 15_000,
      },
    );
  } catch (err) {
    if (rehearse && err instanceof RehearsalRollback) {
      return err.result as T;
    }
    throw err;
  }
}

export async function runStudentTransaction<T>(
  prisma: TransactionRunner,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
  opts: {
    rehearse: boolean;
    /** Wait before attempt n+1 is n × this. Tests pass 0. */
    retryDelayMs?: number;
  },
): Promise<T> {
  const retryDelayMs = opts.retryDelayMs ?? 500;
  for (let attempt = 1; ; attempt++) {
    try {
      return await runOnce(prisma, work, opts.rehearse);
    } catch (err) {
      if (!isWriteConflict(err) || attempt >= MAX_ATTEMPTS) throw err;
      await new Promise((resolve) =>
        setTimeout(resolve, retryDelayMs * attempt),
      );
    }
  }
}
