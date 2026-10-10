/**
 * The server's shapes for «Qaytariladigan pul» (spec B2b §3–§5; the API contract
 * at the end of docs/superpowers/plans/2026-10-10-b2b-qaytariladigan-pul.md).
 * 'YYYY-MM-DD' is a Tashkent day, an ISO string an instant, money whole so'm.
 */
export type RefundableTab = "muzlatilgan" | "guruhsiz" | "ketgan";
export const REFUNDABLE_TABS: readonly RefundableTab[] = ["muzlatilgan", "guruhsiz", "ketgan"];
export type AgeBucket = "upto30" | "d31to60" | "over60";
export const AGE_BUCKETS: readonly AgeBucket[] = ["upto30", "d31to60", "over60"];

export interface NoticeCell { date: string; channel: "BOT" | "CALL" }
export interface TabTotal { total: number; count: number }

export interface RefundableRow {
  studentId: number; firstName: string; lastName: string; phone: string;
  balance: number; kind: RefundableTab; since: string; days: number; ageBucket: AgeBucket;
  lastGroup: { id: string; name: string } | null;
  notice: NoticeCell | null;
}

export interface PendingRefundRow {
  id: string; studentId: number; firstName: string; lastName: string; phone: string;
  /** The «Berildi» dialog lists the `cashAccounts` of this branch. */
  branchId: number | null;
  amount: number; requestedAt: string; dueDate: string;
  due: { overdue: boolean; bankDays: number };
  reason: string | null;
}

export interface CashAccountOption { id: string; name: string; type: "CASH" | "BANK" | "CARD"; branchId: number }

export interface RefundableListResponse {
  summary: TabTotal;
  tabs: Record<RefundableTab, TabTotal>;
  /** The frozen tab's age chips, whatever tab is open. */
  chips: { all: number } & Record<AgeBucket, number>;
  rows: { data: RefundableRow[]; total: number; page: number; pageSize: number };
  pending: {
    data: PendingRefundRow[]; total: number; sum: number; page: number; pageSize: number;
    historyCount: number; lastHandedOverAt: string | null;
  };
  cashAccounts: CashAccountOption[];
}

/** `refusal` is the exact 400 text `POST /withdrawals` would answer. */
export interface TransferState {
  notice: NoticeCell | null; termEnds: string | null; allowedFrom: string | null;
  allowed: boolean; refusal: string | null;
}

export interface DrawerStudent { id: number; firstName: string; lastName: string; phone: string; status: string; branchId: number | null }

export interface RefundableDrawer {
  student: DrawerStudent;
  balance: number;
  /** null = studying now. */
  kind: RefundableTab | null;
  since: string | null; days: number | null;
  lastGroup: { id: string; name: string } | null;
  lastPayment: { createdAt: string; amount: number } | null;
  telegramLinked: boolean;
  /** The exact bot text «Botga xabar yuborish» would send; null = no branch or company phone. */
  noticePreview: string | null;
  transfer: TransferState;
}

export interface RefundHistoryRow {
  id: string;
  student: { id: number; firstName: string; lastName: string; phone: string };
  amount: number;
  status: "REQUESTED" | "APPROVED" | "PROCESSING" | "COMPLETED" | "REJECTED";
  reason: string | null;
  requestedAt: string; dueDate: string | null;
  /** Pre-B2b rows: their `processedAt`. */
  handedOverAt: string | null;
  refundMethod: string | null;
  cancelledAt: string | null; cancelReason: string | null;
  closedBy: { id: number; name: string } | null;
}
export interface RefundHistoryResponse { data: RefundHistoryRow[]; total: number; page: number; pageSize: number }

/** The fields of the Refund row (`POST /refunds/quick`) the client reads. */
export interface RefundRowView { id: string; status: "REQUESTED" | "COMPLETED" | "REJECTED"; requestedAmount: number; dueDate: string | null }
