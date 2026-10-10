/**
 * Events of the «Dars bo'ldimi?» flow (spec 2026-09-29, ADR-0054). Emitted
 * after the transaction that answered the lesson commits.
 */
export const UNMARKED_LESSON_NOT_HELD = 'unmarked-lesson.not-held';
export const UNMARKED_LESSON_HELD = 'unmarked-lesson.held';

/**
 * A question that closed with neither «Bo'ldi» nor «Bo'lmadi»: its day stopped
 * being a lesson day (the move that made it one was deleted or re-dated), or
 * its group was deleted. Nobody is told; `NotificationResolverService` closes
 * the notices the question's task and that day's alerts were waiting on.
 */
export const UNMARKED_LESSON_CLOSED = 'unmarked-lesson.closed';

export interface UnmarkedLessonClosedPayload {
  companyId: number;
  groupId: string;
  /** 'YYYY-MM-DD' of the lesson day whose question closed. */
  date: string;
}

/** «Bo'lmadi» — the Telegram group is told at once (ADR-0025 instant list). */
export interface UnmarkedLessonNotHeldPayload {
  companyId: number;
  branchId: number;
  groupId: string;
  groupName: string;
  /** 'YYYY-MM-DD' of the lesson that did not happen. */
  date: string;
  lessonStartTime: string;
  lessonEndTime: string;
  reason: string;
  decidedById: number;
  outcome: 'CANCELLED' | 'RESCHEDULED';
  refundedStudents?: number;
  refundedAmount?: number;
  newDate?: string;
  newLessonStartTime?: string | null;
  newLessonEndTime?: string | null;
}

/** «Bo'ldi» — the teacher is told the lesson earned nothing (unless exempt). */
export interface UnmarkedLessonHeldPayload {
  companyId: number;
  groupId: string;
  groupName: string;
  date: string;
  teacherPayExempt: boolean;
}
