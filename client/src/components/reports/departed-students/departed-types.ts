/**
 * Mirror of `server/src/reports/departed/departed.types.ts` (the response
 * shapes only): field names are the server's, Dates arrive as ISO strings.
 */

export interface GroupRef {
  id: string;
  name: string;
}

export interface CutRow {
  id: string;
  name: string;
  departed: number;
  atStart: number;
  /** departed ÷ atStart × 100, one decimal; null when atStart < 5. */
  share: number | null;
}

export type CutKey = "teacher" | "course" | "group" | "branch";

export interface DepartedOverview {
  range: { startDate: string; endDate: string };
  previous: { startDate: string; endDate: string };
  cards: {
    departed: number;
    /** null when the previous period starts before the system start date. */
    previousDeparted: number | null;
    atStart: number;
    per100: number | null;
    avgStudyMonths: number | null;
  };
  pendingToday: number;
  months: { key: string; departed: number; provisional: boolean }[];
  reasons: { reasonId: string | null; name: string; count: number }[];
  cuts: Record<CutKey, CutRow[]>;
  /** Each departed student once; the teacher cut may add up to more. */
  uniqueDeparted: number;
  teacherChange: {
    totalTeacherChanges: number;
    departedAfterTeacherChange: number;
  };
  graceDays: { LEFT_GROUP: number; FROZEN: number };
}

export type ListState = "ketgan" | "kutilmoqda" | "qaytgan";

export interface ListRow {
  studentId: number;
  fullName: string;
  phone: string;
  group: GroupRef | null;
  departedAt: string;
  studyMonths: number | null;
  reason: { id: string | null; name: string };
  comment: string | null;
  state: ListState;
  /** so'm owed today; 0 when the balance is not negative. */
  debt: number;
}

export interface DepartedList {
  data: ListRow[];
  total: number;
  page: number;
  pageSize: number;
  /** Over the whole filtered list, not the page. */
  confirmed: number;
  returned: number;
  pending: number;
}

/** `GET /reports/student-payments/filter-options` — only the two lists this page reads. */
export interface DepartedFilterOptions {
  courses: { id: string; name: string }[];
  teachers: { id: number; fullName: string }[];
}
