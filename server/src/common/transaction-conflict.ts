import { ConflictException } from '@nestjs/common';

export const CONCURRENT_CHANGE_MESSAGE =
  "Bir vaqtda boshqa o'zgarish bo'ldi — qayta urinib ko'ring";

/**
 * Another transaction won. Prisma reports a Serializable write conflict
 * (SQLSTATE 40001) as P2034, but @prisma/adapter-pg maps nothing else: a
 * Postgres deadlock (40P01) reaches us as a raw DriverAdapterError — no
 * `code` of its own, the SQLSTATE on `cause.code`.
 */
export function isTransactionConflict(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code === 'P2034' || e?.cause?.code === '40P01';
}

/**
 * `.catch(rethrowAsConflict)` on a transaction: a conflict becomes 409, never
 * retried silently. `duplicate` also maps a unique violation (P2002) — pass it
 * only where every unique index the transaction can hit is checked inside it
 * first, so a violation can only be a concurrent duplicate.
 */
export function rethrowAsConflict(
  err: unknown,
  opts: { duplicate?: boolean } = {},
): never {
  const duplicate =
    opts.duplicate === true &&
    (err as { code?: string } | null)?.code === 'P2002';
  if (isTransactionConflict(err) || duplicate) {
    throw new ConflictException(CONCURRENT_CHANGE_MESSAGE);
  }
  throw err;
}
