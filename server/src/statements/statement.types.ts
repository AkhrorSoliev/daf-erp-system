import type { TransactionType } from '@prisma/client';

/** A Tashkent calendar day, 'YYYY-MM-DD'. */
export type Day = string;
/** A month, 'YYYY-MM'. */
export type MonthKey = string;

export type CoursePaymentModel = 'MONTHLY' | 'LESSON_PACK';

export interface StatementEnrollment {
  id: string;
  /** '#036' */
  group: string;
  status: string;
  /** `startDate ?? createdAt`, as a Tashkent day. */
  start: Day;
  /** The day it stopped (any status but ACTIVE), else null. */
  end: Day | null;
  deleted: boolean;
  course: {
    name: string;
    price: number;
    lessonPaymentCount: number;
    paymentModel: CoursePaymentModel;
  };
  branch: string;
}

export interface StatementRow {
  id: string;
  type: TransactionType;
  amount: number;
  /** `createdAt` as a Tashkent day. */
  day: Day;
  description: string | null;
  metadata: Record<string, unknown> | null;
  enrollmentId: string | null;
  paymentId: string | null;
  paymentMethod: string | null;
  /** Another row reverses this one (`reversedAt` is set). */
  reversed: boolean;
  /** This row reverses another one (`reversedTransactionId` is set). */
  reversal: boolean;
  /** LESSON_DEDUCTION only: the lesson days its package paid, oldest first. */
  consumedDays: Day[] | null;
}

export interface StatementCharge {
  enrollmentId: string;
  period: MonthKey;
  plannedLessons: number;
  coveredDates: Day[];
  frozenOutDates: Day[];
  creditLessons: number;
  creditAmount: number;
  excusedLessons: number;
}

export type AttendanceMark = 'PRESENT' | 'LATE' | 'ABSENT' | 'EXCUSED';

export interface StatementAttendance {
  day: Day;
  group: string;
  status: AttendanceMark;
}

export interface StatementInput {
  asOf: Day;
  student: {
    id: number;
    name: string;
    balance: number;
    discountPercent: number;
  };
  enrollments: StatementEnrollment[];
  /** Every money row of the student, ordered by (createdAt, id). */
  rows: StatementRow[];
  /** CHARGED monthly charges only. */
  charges: StatementCharge[];
  /** Attendance of lessons that were not cancelled. */
  attendance: StatementAttendance[];
}

export type ItemKind =
  | 'refund'
  | 'mock-fee'
  | 'debt-write-off'
  | 'balance-withdrawal'
  | 'discount'
  | 'initial-balance'
  | 'correction'
  | 'unexplained';

/** Money that is neither a payment nor a lesson. It moves the balance. */
export interface StatementItem {
  day: Day;
  kind: ItemKind;
  amount: number;
  description: string | null;
}

export type ReleaseWhy =
  | 'left-group'
  | 'group-change'
  | 'frozen'
  | 'refund'
  | 'other';

/** Bookkeeping that only undoes lesson charges, said out loud. */
export interface StatementNote {
  day: Day;
  kind: 'prepaid-release' | 'monthly-release';
  why: ReleaseWhy;
  lessons: number | null;
  amount: number;
}

export interface PackPart {
  group: string;
  lessons: number;
  cost: number;
  days: Day[];
}

export interface MonthlyPart {
  group: string;
  lessons: number;
  planned: number;
  cost: number;
  perLesson: number;
  fromDay: Day | null;
  excusedLessons: number;
  creditLessons: number;
  creditAmount: number;
}

export type LessonStatus =
  | 'keldi'
  | 'kelmagan'
  | 'uzrli'
  | 'belgilanmagan'
  | 'kelgusi';

export interface LessonDay {
  day: Day;
  group: string;
  status: LessonStatus;
}

export type SharpReason =
  | { kind: 'lessons'; now: number; before: number }
  | { kind: 'price'; now: number; before: number }
  | { kind: 'left'; day: Day; group: string; frozen: boolean }
  | { kind: 'joined'; day: Day; group: string; awaySince: Day | null }
  | { kind: 'model'; to: CoursePaymentModel };

export interface StatementMonth {
  key: MonthKey;
  /** Lessons billed in this month, bookkeeping folded in. */
  lessons: number;
  /** Of them, missed without an excuse (billed like a lesson held). */
  absent: number;
  cost: number;
  /** Payments made this month. */
  paid: number;
  items: StatementItem[];
  /** `paid` plus the items. */
  money: number;
  /** The balance at the end of the month, in this view. */
  running: number;
  preSystem: { lessons: number; amount: number } | null;
  packParts: PackPart[];
  monthlyParts: MonthlyPart[];
  notes: StatementNote[];
  lessonDays: LessonDay[];
  model: CoursePaymentModel | null;
  sharp: { vs: MonthKey; diff: number; reasons: SharpReason[] } | null;
}

export interface ModelChange {
  month: MonthKey;
  to: CoursePaymentModel;
  /** Old-way charges of this month that the switch reversed. */
  oldCharged: number;
  newCharged: number;
  newLessons: number;
  /** Lessons paid the old way that the new charge covers again, credited back. */
  carriedIn: { lessons: number; amount: number } | null;
  /** Old-way lessons this month in a group the new model does not cover. */
  otherGroupPack: Array<{
    group: string;
    days: Day[];
    cost: number;
    leftDay: Day | null;
  }>;
}

export type DueRef =
  | { kind: 'month'; month: MonthKey }
  | { kind: 'item'; itemKind: ItemKind; day: Day }
  | { kind: 'prepaid' };

export interface Allocation {
  day: Day;
  kind: 'payment' | 'credit';
  method: string | null;
  itemKind: ItemKind | null;
  paymentId: string | null;
  amount: number;
  to: Array<{ due: DueRef; amount: number }>;
  leftover: number;
}

export interface StatementModel {
  asOf: Day;
  student: {
    id: number;
    name: string;
    groups: string[];
    course: {
      name: string;
      price: number;
      lessonPaymentCount: number;
      paymentModel: CoursePaymentModel;
    } | null;
    discountPercent: number;
    branch: string | null;
  };
  balance: number;
  headline: {
    kind: 'debt' | 'credit' | 'zero';
    amount: number;
    /** Unpaid dues after FIFO, newest first. Empty unless `kind` is 'debt'. */
    unpaid: Array<{ due: DueRef; amount: number }>;
  };
  equation: {
    paid: number;
    items: Array<{ kind: ItemKind; amount: number }>;
    lessons: number;
    prepaidAhead: number;
    unexplained: number;
    balance: number;
  };
  /** Set when some months were paid with lesson packs. */
  packEra: { size: number; until: MonthKey | null } | null;
  months: StatementMonth[];
  modelChanges: ModelChange[];
  allocations: Allocation[];
}
