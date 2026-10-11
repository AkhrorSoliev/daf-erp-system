import type { PaymentMethod, PaymentSource } from '@prisma/client';
import type { PartView } from './part-labels';
import type { PeriodView } from './payment-period';

export type RowStatus =
  | 'COMPLETED'
  | 'REVERSED'
  | 'PENDING'
  | 'FAILED'
  | 'REFUNDED'
  | 'CANCELLED';

/** One row of the To'lovlar page; the drawer reads the same row (spec B4 §5.2). */
export interface PaymentRow {
  id: string;
  createdAt: string;
  amount: number;
  method: PaymentMethod;
  source: PaymentSource;
  online: boolean;
  status: RowStatus;
  receiptCode: string | null;
  receiptNumber: string | null;
  note: string | null;
  student: {
    id: number;
    firstName: string;
    lastName: string;
    phone: string;
    archived: boolean;
  };
  groups: { id: string; name: string }[];
  receivedBy: {
    id: number;
    firstName: string;
    lastName: string;
    roleLabel: string | null;
  } | null;
  parts: PartView[] | null;
  balanceBefore: number | null;
  balanceAfter: number | null;
  reversal: {
    at: string;
    reason: string | null;
    by: { id: number; firstName: string; lastName: string } | null;
  } | null;
  correctedBy: { id: string; amount: number } | null;
  correctsPayment: { id: string; amount: number } | null;
}

export interface PaymentListResponse {
  period: PeriodView;
  data: PaymentRow[];
  total: number;
  page: number;
  pageSize: number;
  totals: { count: number; amount: number; partAmount: number | null };
}
