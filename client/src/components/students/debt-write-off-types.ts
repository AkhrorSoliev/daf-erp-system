// Shared between the remove-from-group dialog and the (future) profile-page
// write-off button. Mirrors the shape returned by:
//   GET /students/:id/enrollments/:enrollmentId/debt-write-off-eligibility

// STUDENT_ATTENDED was removed when eligibility was relaxed — admin now
// makes the call via the UI even when the student attended a few lessons.
export type DebtWriteOffEligibilityReason = "NO_DEBT" | "NO_ABSENT_IN_CYCLE";

export interface DebtWriteOffEligibilityDetails {
  studentId: number;
  enrollmentId: string;
  groupId: string;
  currentBalance: number;
  enrollmentStatus: "ACTIVE" | "FROZEN" | "COMPLETED" | "DROPPED" | "TRANSFERRED";
  cycleNumber: number;
  cycleStartIndex: number;
  cyclePresentCount: number;
  cycleLateCount: number;
  cycleAbsentCount: number;
  cycleExcusedCount: number;
  lessonPaymentCount: number;
  perLessonCost: number;
  theoreticalCycleDebt: number;
  // Kept for backward compatibility — equals realDebtAmount.
  suggestedWriteOff: number;
  attendedCost: number;
  absentCost: number;
  realDebtAmount: number;
  totalDebtAmount: number;
  maxWriteOff: number;
}

export interface DebtWriteOffEligibility {
  eligible: boolean;
  reason?: DebtWriteOffEligibilityReason;
  details: DebtWriteOffEligibilityDetails;
}
