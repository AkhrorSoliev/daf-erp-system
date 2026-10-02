import {
  PaymentMethod,
  TelegramDigestCategory,
  TelegramDigestItem,
  TelegramDigestRecipientKind,
} from '@prisma/client';
import type {
  EnrollmentMessagePayload,
  RemovalMessagePayload,
} from '../sms/sms-templates';

/**
 * Structured payloads for the Telegram digest queue — one interface per
 * category. Never store rendered text here: the 20:00 crons render at send
 * time (ADR-0025), so anything that can go stale (a balance) is re-read then.
 */

export interface PaymentReceivedDigestPayload {
  paymentId: string;
  amount: number;
  method: PaymentMethod;
  /** Built at enqueue time with the same rule the instant receipt used. */
  receiptUrl: string;
  /** Staff member who recorded the payment → `SmsMessage.senderUserId`. */
  performedById: number | null;
}

export interface PaymentReversedDigestPayload {
  paymentId: string;
  amount: number;
  reason: string | null;
  performedById: number | null;
}

export type StudentEnrolledDigestPayload = EnrollmentMessagePayload;
export type StudentRemovedDigestPayload = RemovalMessagePayload;

export interface DebtChargeDigestPayload {
  /** The attendance whose SINGLE_UNCOVERED deduction created the debt. */
  attendanceId: string;
  groupName: string;
  perLessonCost: number;
  /** Lesson date, 'YYYY-MM-DD'. */
  date: string;
}

/** TASK_ASSIGNED, TASK_UPDATED and TASK_DELETED share this shape. */
export interface TaskDigestPayload {
  authorName: string;
  content: string;
}

export interface TaskStatusChangedDigestPayload {
  assigneeName: string;
  /** AssigneeStatus value as emitted (`SEEN`, `DONE`, …). */
  status: string;
  content: string;
}

export interface PaymentCorrectedDigestPayload {
  performerName: string;
  studentName: string;
  studentId: number;
  oldAmount: number;
  newAmount: number;
  oldMethod: PaymentMethod;
  newMethod: PaymentMethod;
  reason: string;
}

export interface SalaryCarriedOverDigestPayload {
  count: number;
  total: number;
}

export interface AttendanceCompletedDigestPayload {
  groupId: string;
  groupName: string;
  /** Lesson date, 'YYYY-MM-DD'. */
  date: string;
  present: number;
  absent: number;
  late: number;
  excused: number;
}

/** «Bo'ldi» — the lesson was marked after it ended; no pay (ADR-0054). */
export interface LessonPayForfeitedDigestPayload {
  groupId: string;
  groupName: string;
  /** Lesson date, 'YYYY-MM-DD'. */
  date: string;
}

export interface GroupNewStudentDigestPayload {
  studentId: number;
  name: string;
  branchName: string | null;
}

export interface GroupNewGroupDigestPayload {
  groupId: string;
  name: string;
  branchName: string | null;
  /** ISO timestamp or null. */
  startDate: string | null;
}

export interface GroupPaymentDigestPayload {
  paymentId: string;
  studentName: string;
  amount: number;
  method: PaymentMethod;
}

export type GroupStatusTransition =
  | 'GROUP_STARTED'
  | 'GROUP_COMPLETED'
  | 'STUDENT_FROZEN'
  | 'STUDENT_EXPELLED'
  | 'STUDENT_GRADUATED'
  | 'STUDENT_REACTIVATED';

export interface GroupStatusChangeDigestPayload {
  entityType: 'Group' | 'Student';
  entityId: string;
  /** Group or student name; `ID <entityId>` when the row was already gone. */
  name: string;
  transition: GroupStatusTransition;
  reason: string | null;
  actorName: string | null;
  actorRole: string | null;
  branchName: string | null;
}

/**
 * The month's bill (ADR-0042). Figures are the charge's own, frozen when it
 * was written; the debt and the total are NOT here — the renderer reads the
 * live balance at 20:00.
 */
export interface MonthlyChargeDigestPayload {
  /** EnrollmentMonthlyCharge.id — re-read at 20:00; a reversed charge is not sent. */
  chargeId: string;
  groupName: string;
  /** `shortWeekdaysLabel(group.exactDays)`, e.g. 'Du, Cho, Ju'; '' when the group has no days. */
  daysLabel: string;
  periodYear: number;
  /** 1–12. */
  periodMonth: number;
  /** What the charged lessons cost this student before the excused-lesson credit: chargedAmount + creditAmount. */
  price: number;
  coveredLessons: number;
  creditLessons: number;
  creditAmount: number;
  chargedAmount: number;
  /** 'YYYY-MM-DD' — the student's 2nd lesson of the month (`paymentDueDate`); null with fewer than two lessons. */
  dueDate: string | null;
  /**
   * ADR-0064: what of this charge is due by its 2nd lesson (`leastDue`).
   * Absent: the whole charge is, as before the least share.
   */
  minShare?: number;
}

/**
 * A payment reminder: the evening before the 2nd lesson (ADR-0042), or, with
 * `paidThrough`, the days before a part payer's paid lessons run out
 * (contract 3.7, ADR-0064).
 */
export interface PaymentReminderDigestPayload {
  /** Re-read at 20:00: a closed enrollment gets no reminder. */
  enrollmentId: string;
  groupName: string;
  periodYear: number;
  /** 1–12. */
  periodMonth: number;
  /**
   * 'YYYY-MM-DD' — tomorrow's lesson, the student's 2nd of the month. With
   * `paidThrough`: the first lesson the payments do not reach.
   */
  lessonDate: string;
  /**
   * ADR-0064, the 2nd-lesson reminder under the least share: the least
   * payment that admits to tomorrow's lesson. `minPaidPercent` only when
   * the share, not the lessons held, is what is short. No `minDue`: the
   * reminder every debtor got before it.
   */
  minDue?: number;
  minPaidPercent?: number;
  /**
   * Contract 3.7: the last lesson the payments reach, and the Tashkent day
   * the row was queued for — a row kept after a failed send is not sent on
   * another day.
   */
  paidThrough?: { through: string; queuedFor: string };
}

/** Fails to compile when a category is added to the enum without a payload. */
type EveryCategory<T extends Record<TelegramDigestCategory, unknown>> = T;

export type DigestPayloadByCategory = EveryCategory<{
  PAYMENT_RECEIVED: PaymentReceivedDigestPayload;
  PAYMENT_REVERSED: PaymentReversedDigestPayload;
  STUDENT_ENROLLED: StudentEnrolledDigestPayload;
  STUDENT_REMOVED: StudentRemovedDigestPayload;
  DEBT_CHARGE: DebtChargeDigestPayload;
  TASK_ASSIGNED: TaskDigestPayload;
  TASK_UPDATED: TaskDigestPayload;
  TASK_DELETED: TaskDigestPayload;
  TASK_STATUS_CHANGED: TaskStatusChangedDigestPayload;
  PAYMENT_CORRECTED: PaymentCorrectedDigestPayload;
  SALARY_CARRIED_OVER: SalaryCarriedOverDigestPayload;
  ATTENDANCE_COMPLETED: AttendanceCompletedDigestPayload;
  GROUP_NEW_STUDENT: GroupNewStudentDigestPayload;
  GROUP_NEW_GROUP: GroupNewGroupDigestPayload;
  GROUP_PAYMENT: GroupPaymentDigestPayload;
  GROUP_STATUS_CHANGE: GroupStatusChangeDigestPayload;
  MONTHLY_CHARGE: MonthlyChargeDigestPayload;
  PAYMENT_REMINDER: PaymentReminderDigestPayload;
  LESSON_PAY_FORFEITED: LessonPayForfeitedDigestPayload;
}>;

/** Who each category is written for — a student row read as USER is never rendered. */
export type RecipientKindByCategory = EveryCategory<{
  PAYMENT_RECEIVED: 'STUDENT';
  PAYMENT_REVERSED: 'STUDENT';
  STUDENT_ENROLLED: 'STUDENT';
  STUDENT_REMOVED: 'STUDENT';
  DEBT_CHARGE: 'STUDENT';
  TASK_ASSIGNED: 'USER';
  TASK_UPDATED: 'USER';
  TASK_DELETED: 'USER';
  TASK_STATUS_CHANGED: 'USER';
  PAYMENT_CORRECTED: 'USER';
  SALARY_CARRIED_OVER: 'USER';
  ATTENDANCE_COMPLETED: 'USER';
  GROUP_NEW_STUDENT: 'GROUP';
  GROUP_NEW_GROUP: 'GROUP';
  GROUP_PAYMENT: 'GROUP';
  GROUP_STATUS_CHANGE: 'GROUP';
  MONTHLY_CHARGE: 'STUDENT';
  PAYMENT_REMINDER: 'STUDENT';
  LESSON_PAY_FORFEITED: 'USER';
}>;

/**
 * One queue write. A union over categories, so `category` decides which
 * payload shape and which recipient kind the compiler accepts — a misspelled
 * field cannot reach 20:00 as `undefined`, and a student notice cannot be
 * queued for a staff member.
 */
export type EnqueueDigestItem = {
  [C in TelegramDigestCategory]: {
    recipientKind: RecipientKindByCategory[C];
    recipientId: number;
    companyId: number;
    branchId?: number | null;
    category: C;
    relatedEntityId?: string | null;
    payload: DigestPayloadByCategory[C];
  };
}[TelegramDigestCategory];

/** The columns renderers and crons read from a queued row. */
export type TelegramDigestItemRow = Pick<
  TelegramDigestItem,
  | 'id'
  | 'companyId'
  | 'branchId'
  | 'category'
  | 'relatedEntityId'
  | 'payload'
  | 'createdAt'
>;

export type PersonalRecipientKind = Exclude<
  TelegramDigestRecipientKind,
  'GROUP'
>;

/**
 * Typed view of a row's payload. The category argument only selects the
 * type; the caller has already checked `row.category`.
 */
export function payloadOf<C extends TelegramDigestCategory>(
  row: TelegramDigestItemRow,
  _category: C,
): DigestPayloadByCategory[C] {
  return row.payload as unknown as DigestPayloadByCategory[C];
}
