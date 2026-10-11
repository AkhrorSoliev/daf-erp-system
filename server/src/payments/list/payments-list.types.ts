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

/** `GET /payments/list/rows/:id` (spec B4 §5.3). */
export interface PaymentRowResponse {
  period: PeriodView;
  row: PaymentRow;
}

/** `GET /payments/list/summary` (spec B4 §5.4). */
export interface PaymentSummary {
  period: PeriodView;
  total: number;
  paymentCount: number;
  payerCount: number;
  parts: {
    currentMonth: number;
    advance: number;
    lateTotal: number;
    late: { monthKey: string; label: string; amount: number }[];
  };
  byMethod: { method: PaymentMethod; amount: number; count: number }[];
  online: { amount: number; count: number };
}

/** `GET /payments/list/filter-options` (spec B4 §5.5). */
export interface PaymentFilterOptions {
  groups: { id: string; name: string }[];
  teachers: { id: number; firstName: string; lastName: string }[];
  courses: { id: string; name: string }[];
  receivers: { id: number; firstName: string; lastName: string }[];
}
