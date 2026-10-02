/**
 * A student enrolled themselves (the Telegram registration) and the enrollment
 * row is written. Billing charges the join month at once
 * (`MonthlyChargeService.chargeJoinMonth`), as the admin door does inside its
 * own transaction. The bot cannot call billing directly: BillingModule →
 * TelegramDigestModule → TelegramModule would become a cycle.
 */
export const STUDENT_SELF_ENROLLED = 'enrollment.self-enrolled';

export interface StudentSelfEnrolledEvent {
  enrollmentId: string;
  companyId: number;
}
