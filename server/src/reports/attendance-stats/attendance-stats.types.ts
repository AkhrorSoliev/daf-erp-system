import type { AttendanceStatus } from '@prisma/client';

/** The three cuts of «Davomati past guruhlar» (spec B7c §4). */
export type CutKey = 'group' | 'teacher' | 'course';

/** Calendar days `[from, to)`, 'YYYY-MM-DD'. An `@db.Date`'s UTC day is the Tashkent day. */
export interface DayWindow {
  from: string;
  to: string;
}

/** One attendance mark: one student, one group, one day (spec §3). */
export interface AttRow {
  groupId: string;
  studentId: number;
  date: string;
  status: AttendanceStatus;
  /** `cancellationId` set: the centre cancelled the lesson (its status is EXCUSED). */
  cancelled: boolean;
}

export interface GroupFact {
  id: string;
  name: string;
  branchId: number;
  deleted: boolean;
  courseId: string;
  courseName: string;
  /** The course's payment model is MONTHLY (only those feed the «Sababli» money block). */
  monthly: boolean;
  /** The group's current teacher (the first by name when there are several); null = «Ustozsiz». */
  teacherId: number | null;
  teacherName: string | null;
}

export interface AttendanceFacts {
  rows: AttRow[];
  groups: Map<string, GroupFact>;
}

export interface Counts {
  came: number;
  late: number;
  absent: number;
  excused: number;
  cancelled: number;
}

/** The month's CHARGED `EnrollmentMonthlyCharge` of a student in a group. */
export interface ChargeFact {
  studentId: number;
  groupId: string;
  month: string;
  perLessonCost: number;
  discountPercent: number;
}

/** `payment.excusedCreditEnabled` / `payment.excusedCreditMonthlyCap` as read for one branch. */
export interface CreditSetting {
  enabled: boolean;
  cap: number | null;
}

/**
 * `lessons` / `students` / `uncharged` count the period's «Sababli» marks of every
 * in-scope monthly group, whatever the branch's setting; `amount` prices only the
 * branches with the credit on. When the scope mixes on and off branches the counts
 * can exceed what the amount covers, so the client words the amount as an estimate
 * and keeps the counts in their own sentence (no money wording on the server).
 */
export interface CreditResult {
  /** «Sababli» marks of the period in monthly-course groups. */
  lessons: number;
  students: number;
  /** The estimated deduction from the next month's bill; null when the setting is off. */
  amount: number | null;
  enabled: boolean;
  /** Of `lessons`, those whose month has no CHARGED charge: counted, never priced. */
  uncharged: number;
}

export interface CutRow {
  key: string;
  name: string;
  deleted: boolean;
  counts: Counts;
  /** Keldi + Kechikdi + Kelmadi. */
  lessons: number;
  rate: number | null;
  /** Distinct students with 3+ «Kelmadi» in one of the row's groups. */
  missers: number;
}

export interface MonthBar {
  month: string;
  counts: Counts;
  rate: number | null;
  /** The month is not over yet. */
  partial: boolean;
}

/** `day`: 1 = dushanba … 7 = yakshanba. */
export interface WeekdayRow {
  day: number;
  counts: Counts;
  rate: number | null;
}

export interface AttendanceOverview {
  range: { startDate: string; endDate: string };
  previous: { startDate: string; endDate: string } | null;
  card: {
    counts: Counts;
    lessons: number;
    attended: number;
    rate: number | null;
    previousRate: number | null;
  };
  months: MonthBar[];
  weekdays: WeekdayRow[];
  credit: CreditResult;
  cut: {
    key: CutKey;
    rows: CutRow[];
    /** Listed rows (at or above `minLessons`), before paging. */
    total: number;
    /** Rows below `minLessons`: not listed, still in every total. */
    hidden: number;
    minLessons: number;
    page: number;
    pageSize: number;
  };
  /** Students on a 3+ unexcused streak TODAY (`AbsenceStreakService`), whatever the period. */
  streak: number;
}

/** Everything `buildOverview` assembles; the service adds `streak`. */
export type OverviewCore = Omit<AttendanceOverview, 'streak'>;

export interface MisserPair {
  studentId: number;
  groupId: string;
  absent: number;
  /** Keldi + Kechikdi + Kelmadi of the pair. */
  lessons: number;
}

export interface MisserRow extends MisserPair {
  name: string;
  groupName: string;
}

export interface MissersPage {
  rows: MisserRow[];
  total: number;
  page: number;
  pageSize: number;
}
