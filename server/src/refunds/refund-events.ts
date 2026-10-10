/**
 * Refund events (ADR-0077), emitted only AFTER the transaction that wrote the
 * change has committed. The payload is ids only: the listener re-reads what
 * the student's message needs, so it always tells the committed truth.
 */
export const REFUND_REQUESTED_EVENT = 'refund.requested';
export const REFUND_HANDED_OVER_EVENT = 'refund.handed-over';
export const REFUND_CANCELLED_EVENT = 'refund.cancelled';

export interface RefundEventPayload {
  refundId: string;
  studentId: number;
  companyId: number;
  performedById: number;
}
