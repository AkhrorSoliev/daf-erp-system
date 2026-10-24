import { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { tashkentMonthKey } from '../common/date/tashkent';
import { isTransactionConflict } from '../common/transaction-conflict';

/**
 * Receipt numbers (spec B4 §4.7). `receiptCode` is unique across the whole
 * table, so the next number is the GLOBAL highest of the year's prefix + 1,
 * and the year is the Tashkent year (Railway runs in UTC). Allocated in its own
 * Serializable transaction, never inside the money transaction: a numbering
 * clash must not refuse a payment. Retried on a clash.
 */
const TRIES = 3;
const TX = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 5_000,
  timeout: 10_000,
};
const retryable = (e: unknown) =>
  isTransactionConflict(e) ||
  (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002');

export function nextSequence(lastCode: string | null, prefix: string): string {
  if (!lastCode) return '00001';
  const n = parseInt(lastCode.replace(prefix, ''), 10);
  return Number.isNaN(n) ? '00001' : String(n + 1).padStart(5, '0');
}

async function withRetry<T>(run: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (e) {
      if (attempt >= TRIES || !retryable(e)) throw e;
    }
  }
}

/** `null` = no such payment. */
export function allocatePaymentReceiptCode(
  prisma: PrismaService,
  paymentId: string,
): Promise<string | null> {
  return withRetry(() =>
    prisma.$transaction(async (tx) => {
      const p = await tx.payment.findUnique({
        where: { id: paymentId },
        select: { receiptCode: true, createdAt: true },
      });
      if (!p) return null;
      if (p.receiptCode) return p.receiptCode;
      const prefix = `R-${tashkentMonthKey(p.createdAt).slice(0, 4)}-`;
      const last = await tx.payment.findFirst({
        where: { receiptCode: { startsWith: prefix } },
        orderBy: { receiptCode: 'desc' },
        select: { receiptCode: true },
      });
      const code = `${prefix}${nextSequence(last?.receiptCode ?? null, prefix)}`;
      await tx.payment.update({
        where: { id: paymentId },
        data: { receiptCode: code },
      });
      return code;
    }, TX),
  );
}

/** `null` = no such refund. */
export function allocateRefundReceiptCode(
  prisma: PrismaService,
  refundId: string,
): Promise<string | null> {
  return withRetry(() =>
    prisma.$transaction(async (tx) => {
      const r = await tx.refund.findUnique({
        where: { id: refundId },
        select: { receiptCode: true },
      });
      if (!r) return null;
      if (r.receiptCode) return r.receiptCode;
      const prefix = `Q-${tashkentMonthKey(new Date()).slice(0, 4)}-`;
      const last = await tx.refund.findFirst({
        where: { receiptCode: { startsWith: prefix } },
        orderBy: { receiptCode: 'desc' },
        select: { receiptCode: true },
      });
      const code = `${prefix}${nextSequence(last?.receiptCode ?? null, prefix)}`;
      await tx.refund.update({
        where: { id: refundId },
        data: { receiptCode: code },
      });
      return code;
    }, TX),
  );
}
