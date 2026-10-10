import { Prisma, RefundStatus, type PaymentMethod } from '@prisma/client';
import { tashkentDateStr } from '../common/date/tashkent';

/**
 * A Refund row as the API sends it: `dueDate` is the Tashkent day
 * ('YYYY-MM-DD'), never the stored 00:00-Tashkent instant (19:00 UTC the day
 * before, which a client slicing the ISO string would read a day early).
 */
export function refundView<T extends { dueDate: Date | null }>(
  row: T,
): Omit<T, 'dueDate'> & { dueDate: string | null } {
  return { ...row, dueDate: row.dueDate ? tashkentDateStr(row.dueDate) : null };
}

const PERSON = {
  select: { id: true, firstName: true, lastName: true },
} as const;

/** What the history list reads of a refund. */
export const REFUND_HISTORY_SELECT = {
  id: true,
  status: true,
  requestedAmount: true,
  approvedAmount: true,
  reason: true,
  createdAt: true,
  dueDate: true,
  handedOverAt: true,
  processedAt: true,
  refundMethod: true,
  cancelledAt: true,
  cancelReason: true,
  student: {
    select: { id: true, firstName: true, lastName: true, phone: true },
  },
  handedOverBy: PERSON,
  processedBy: PERSON,
  cancelledBy: PERSON,
} satisfies Prisma.RefundSelect;

type RefundHistoryFact = Prisma.RefundGetPayload<{
  select: typeof REFUND_HISTORY_SELECT;
}>;

export interface RefundHistoryRow {
  id: string;
  student: { id: number; firstName: string; lastName: string; phone: string };
  amount: number;
  status: RefundStatus;
  reason: string | null;
  requestedAt: string;
  dueDate: string | null;
  handedOverAt: string | null;
  refundMethod: PaymentMethod | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  closedBy: { id: number; name: string } | null;
}

const person = (
  u: { id: number; firstName: string; lastName: string } | null,
) => (u ? { id: u.id, name: `${u.firstName} ${u.lastName}`.trim() } : null);

/**
 * One history line. A refund paid out before ADR-0077 was handed over on the
 * spot, so its `processedAt` / `processedBy` stand for «Berildi».
 */
export function toRefundHistoryRow(r: RefundHistoryFact): RefundHistoryRow {
  const completed = r.status === RefundStatus.COMPLETED;
  const rejected = r.status === RefundStatus.REJECTED;
  const handedOverAt = completed ? (r.handedOverAt ?? r.processedAt) : null;
  return {
    id: r.id,
    student: r.student,
    amount: r.approvedAmount ?? r.requestedAmount,
    status: r.status,
    reason: r.reason,
    requestedAt: r.createdAt.toISOString(),
    dueDate: r.dueDate ? tashkentDateStr(r.dueDate) : null,
    handedOverAt: handedOverAt?.toISOString() ?? null,
    refundMethod: r.refundMethod,
    cancelledAt: r.cancelledAt?.toISOString() ?? null,
    cancelReason: r.cancelReason,
    closedBy: completed
      ? person(r.handedOverBy ?? r.processedBy)
      : rejected
        ? person(r.cancelledBy ?? r.processedBy)
        : null,
  };
}
