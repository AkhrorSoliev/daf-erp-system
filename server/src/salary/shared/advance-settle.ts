import { Prisma } from '@prisma/client';
import { planAdvanceNetting } from './advance-netting';

/**
 * Settles, against one `SalaryPayment`, the person's unsettled TEACHER_ADVANCE
 * expenses that fit into `available` (ADR-0082: `planAdvanceNetting` — only
 * advances dated before the period's exclusive end, `createdAt` order, stop at
 * the first that does not fit). Returns the total it settled.
 *
 * It marks the expenses and nothing else: the caller owns `SalaryPayment.amount`,
 * because the cron creates the payment net of the advances while the manual
 * correction recomputes an existing one. Must run inside the transaction that
 * writes the payment, so the settlement and the amount stay consistent.
 */
export async function settlePendingAdvances(
  tx: Prisma.TransactionClient,
  p: {
    paymentId: string;
    available: number;
    userId: number;
    companyId: number;
    periodEndDateExclusive: Date;
  },
): Promise<number> {
  const pending = await tx.expense.findMany({
    where: {
      category: 'TEACHER_ADVANCE',
      relatedUserId: p.userId,
      companyId: p.companyId,
      settledBySalaryPaymentId: null,
      deletedAt: null,
    },
    select: { id: true, amount: true, date: true, createdAt: true },
  });
  if (pending.length === 0) return 0;

  const { settle, total } = planAdvanceNetting(
    pending,
    p.available,
    p.periodEndDateExclusive,
  );
  if (settle.length === 0) return 0;

  await tx.expense.updateMany({
    where: { id: { in: settle } },
    data: { settledBySalaryPaymentId: p.paymentId },
  });
  return total;
}
