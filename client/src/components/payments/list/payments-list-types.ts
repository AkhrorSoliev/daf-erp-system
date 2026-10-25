/** Copies of the server's `GET /payments/list/*` shapes (`server/src/payments/list/`, spec B4 §5). */

export type PaymentMethod = "CASH" | "PAYME" | "CLICK" | "UZUM" | "TRANSFER" | "QR";
export type PaymentSource = "ADMIN_MANUAL" | "STUDENT_PORTAL" | "GATEWAY_WEBHOOK" | "MANUAL_ATTACH";
export type RowStatus = "COMPLETED" | "REVERSED" | "PENDING" | "FAILED" | "REFUNDED" | "CANCELLED";
export type PartKind = "CURRENT" | "ADVANCE" | "LATE";

/** The period the server actually used; the drawer's note reads it. */
export interface PeriodView {
  start: string;
  end: string;
  singleMonth: boolean;
  endsOnMonthEnd: boolean;
}

export interface PartView {
  kind: PartKind;
  monthKey: string | null;
  label: string;
  amount: number;
}

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
  student: { id: number; firstName: string; lastName: string; phone: string; archived: boolean };
  groups: { id: string; name: string }[];
  receivedBy: { id: number; firstName: string; lastName: string; roleLabel: string | null } | null;
  parts: PartView[] | null;
  balanceBefore: number | null;
  balanceAfter: number | null;
  reversal: { at: string; reason: string | null; by: { id: number; firstName: string; lastName: string } | null } | null;
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

export interface PaymentRowResponse {
  period: PeriodView;
  row: PaymentRow;
}

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

export interface PaymentFilterOptions {
  groups: { id: string; name: string }[];
  teachers: { id: number; firstName: string; lastName: string }[];
  courses: { id: string; name: string }[];
  receivers: { id: number; firstName: string; lastName: string }[];
}
