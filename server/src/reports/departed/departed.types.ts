import type { StopKind } from '../../students/shared/departure-episodes';

export interface NamedId<T extends string | number = string> {
  id: T;
  name: string;
}

export interface TeacherRef {
  id: number;
  fullName: string;
}

export interface GroupRef {
  id: string;
  name: string;
}

/** Where a student sat: the group and what hangs off it. Every part may be unknown. */
export interface Placement {
  group: GroupRef | null;
  course: NamedId | null;
  branch: NamedId<number> | null;
  teachers: TeacherRef[];
}

/** One departure episode with everything the page needs (spec §3). */
export interface DepartureFact extends Placement {
  /** `${studentId}:${startedAt.getTime()}` — one episode. */
  key: string;
  studentId: number;
  fullName: string;
  phone: string;
  /** The student's balance today, so'm (negative = owes). */
  balance: number;
  startedAt: Date;
  stopKind: StopKind;
  state: 'pending' | 'confirmed';
  returnedAt: Date | null;
  reason: { id: string | null; name: string };
  comment: string | null;
  /** Months from the first enrollment to the stop; null when unknown. */
  studyMonths: number | null;
}

/** A student studying at the start of the range, with where he sat then. */
export interface StartMember extends Placement {
  studentId: number;
}

export interface DepartedFilter {
  courseIds?: string[];
  teacherIds?: number[];
}

export interface CutRow {
  id: string;
  name: string;
  departed: number;
  atStart: number;
  /** departed ÷ atStart × 100, one decimal; null when atStart < 5. */
  share: number | null;
}

export type CutKey = 'teacher' | 'course' | 'group' | 'branch';

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

export type ListState = 'ketgan' | 'kutilmoqda' | 'qaytgan';

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
