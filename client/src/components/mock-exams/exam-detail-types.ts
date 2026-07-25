import type { MockExamSummary } from "@/hooks/use-mock-exams-board";

export interface MockExamSubject {
  id: string;
  examId: string;
  name: string;
  maxScore: number;
  order: number;
}

export interface ExamDetail extends MockExamSummary {
  section: { id: string; name: string; color: string | null };
  subjects: MockExamSubject[];
  /** R2 public URL for the announced results PDF. Null while < ANNOUNCED. */
  resultsPdfUrl: string | null;
  resultsPdfGeneratedAt: string | null;
}

export interface MockExamParticipant {
  id: string;
  /**
   * 5-digit public identifier. Equals Student.id when the participant is a
   * DaF student; otherwise drawn from the same sequence so future
   * conversion preserves the id. Shown in the table, the Click/Payme
   * payment instructions and the eventual results PDF.
   */
  publicId: number;
  firstName: string;
  lastName: string;
  phone: string;
  telegramChatId: string | null;
  telegramUsername: string | null;
  registeredAt: string;
  /** Set only when the participant is a real DaF student. */
  studentId: number | null;
  /** CEFR level the participant chose (null when the exam offers none). */
  level: string | null;
  /** The fee locked in for this registration (after any DaF discount). */
  feeAmount: number | null;
  paid: boolean;
  paidAt: string | null;
  totalScore: number | null;
  percentage: number | null;
  passed: boolean | null;
  rank: number | null;
}
