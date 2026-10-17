/** The server's answer (server/src/reports/attendance-stats/attendance-stats.types.ts) — same field names. */
export type CutKey = "group" | "teacher" | "course";

export interface Counts {
  came: number;
  late: number;
  absent: number;
  excused: number;
  cancelled: number;
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

export interface AttendanceOverview {
  range: { startDate: string; endDate: string };
  previous: { startDate: string; endDate: string } | null;
  card: { counts: Counts; lessons: number; attended: number; rate: number | null; previousRate: number | null };
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

export interface MisserRow {
  studentId: number;
  groupId: string;
  absent: number;
  /** Keldi + Kechikdi + Kelmadi of the pair. */
  lessons: number;
  name: string;
  groupName: string;
}

export interface MissersPage {
  rows: MisserRow[];
  total: number;
  page: number;
  pageSize: number;
}
