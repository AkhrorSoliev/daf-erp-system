// Shared between the remove-from-group dialog and the (future) profile-page
// write-off button. Mirrors the shape returned by:
//   GET /students/:id/enrollments/:enrollmentId/debt-write-off-eligibility

export type DebtWriteOffEligibilityReason =
  | "NO_DEBT"
  | "STUDENT_ATTENDED"
  | "NO_ABSENT_IN_CYCLE";

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
  suggestedWriteOff: number;
}

export interface DebtWriteOffEligibility {
  eligible: boolean;
  reason?: DebtWriteOffEligibilityReason;
  details: DebtWriteOffEligibilityDetails;
}
