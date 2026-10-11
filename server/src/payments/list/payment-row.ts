import type { Prisma } from '@prisma/client';
import type { PaymentParts } from '../../common/finance/income-attribution';
import { reversalReason } from '../../transactions/reversal-view';
import { partViews, type PeriodShape } from './part-labels';
import type { PaymentRow } from './payments-list.types';

/**
 * Everything one row and its drawer show, in one read. The balance and the
 * reversal come from the payment's own original PAYMENT ledger row (spec B4
 * §4.9): `reversedTransactionId: null` is the original even when reversed.
 */
export const PAYMENT_ROW_SELECT = {
  id: true,
  amount: true,
  method: true,
  status: true,
  source: true,
  receiptCode: true,
  receiptNumber: true,
  note: true,
  createdAt: true,
  studentId: true,
  student: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      deletedAt: true,
    },
  },
  receivedBy: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      roles: { select: { roleId: true } },
    },
  },
  correctsPayment: { select: { id: true, amount: true } },
  correctedBy: { select: { id: true, amount: true } },
  transactions: {
    where: { type: 'PAYMENT', reversedTransactionId: null },
    take: 1,
    select: {
      balanceBefore: true,
      balanceAfter: true,
      reversalEntries: {
        take: 1,
        orderBy: { createdAt: 'desc' },
        select: {
          createdAt: true,
          description: true,
          performedBy: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      },
    },
  },
} satisfies Prisma.PaymentSelect;

export type LoadedPayment = Prisma.PaymentGetPayload<{
  select: typeof PAYMENT_ROW_SELECT;
}>;

const ROLE_LABELS: Record<number, string> = {
  1: 'CEO',
  2: 'direktor',
  3: 'admin',
  5: 'kassir',
};

/** The receiver's highest of CEO / director / admin / cashier, else none (spec B4 §4.10). */
export function roleLabelOf(roleIds: readonly number[]): string | null {
  const top = [1, 2, 3, 5].find((id) => roleIds.includes(id));
  return top == null ? null : ROLE_LABELS[top];
}

export interface RowContext {
  parts: PaymentParts | undefined;
  shape: PeriodShape;
  currentYear: string;
  groups: { id: string; name: string }[];
}

export function toPaymentRow(p: LoadedPayment, ctx: RowContext): PaymentRow {
  const tx = p.transactions[0];
  const rev = tx?.reversalEntries[0];
  return {
    id: p.id,
    createdAt: p.createdAt.toISOString(),
    amount: p.amount,
    method: p.method,
    source: p.source,
    online: p.source === 'GATEWAY_WEBHOOK',
    status: p.status,
    receiptCode: p.receiptCode,
    receiptNumber: p.receiptNumber,
    note: p.note,
    student: {
      id: p.student.id,
      firstName: p.student.firstName,
      lastName: p.student.lastName,
      phone: p.student.phone,
      archived: p.student.deletedAt != null,
    },
    groups: ctx.groups,
    receivedBy: p.receivedBy
      ? {
          id: p.receivedBy.id,
          firstName: p.receivedBy.firstName,
          lastName: p.receivedBy.lastName,
          roleLabel: roleLabelOf(p.receivedBy.roles.map((r) => r.roleId)),
        }
      : null,
    parts:
      p.status === 'COMPLETED' && ctx.parts
        ? partViews(ctx.parts, ctx.shape, ctx.currentYear)
        : null,
    balanceBefore: tx?.balanceBefore ?? null,
    balanceAfter: tx?.balanceAfter ?? null,
    reversal: rev
      ? {
          at: rev.createdAt.toISOString(),
          reason: reversalReason(rev.description),
          by: rev.performedBy,
        }
      : null,
    correctedBy: p.correctedBy,
    correctsPayment: p.correctsPayment,
  };
}
