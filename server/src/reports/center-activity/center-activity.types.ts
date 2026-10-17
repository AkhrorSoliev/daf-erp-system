import type { EnrollmentStatusEvent } from '../../students/shared/enrollment-status-on';
import type { Heat } from './center-heat';
import type { HeatInsight } from './heat-insight';

export const WEEK_DAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;
export type WeekDay = (typeof WEEK_DAYS)[number];
export const DAY_SHORT: Record<WeekDay, string> = {
  monday: 'Du',
  tuesday: 'Se',
  wednesday: 'Chor',
  thursday: 'Pay',
  friday: 'Ju',
  saturday: 'Sha',
};
export const DEFAULT_WORK_START = '09:00';
export const DEFAULT_WORK_END = '21:00';

export interface Point<T> {
  validFrom: Date;
  validTo: Date | null;
  value: T;
}
export interface WorkWindow {
  start: string;
  end: string;
}
export interface RoomFact {
  id: string;
  name: string;
  branchId: number;
  branchName: string;
  createdAt: Date;
  deletedAt: Date | null;
  status: string;
  capacityNow: number | null;
  capacityHistory: Point<number>[];
  window: WorkWindow;
}
export interface ScheduleValue {
  exactDays: string[];
  start: string | null;
  end: string | null;
  courseId: string | null;
}
export interface EnrollmentFact {
  createdAt: Date;
  statusChangedAt: Date | null;
  status: string;
  /**
   * MUST arrive ascending by time, then id, and already carry its opening row
   * (`supplyOpeningRow`); `enrollmentStatusOn` reads it as given.
   */
  log: EnrollmentStatusEvent[];
}
export interface GroupFact {
  id: string;
  name: string;
  roomId: string | null;
  branchId: number;
  createdAt: Date;
  startDate: Date | null;
  endDate: Date | null;
  deletedAt: Date | null;
  scheduleNow: ScheduleValue;
  scheduleHistory: Point<ScheduleValue>[];
  /** MUST arrive ascending by time, then id; the readers stop at the first later row. */
  statusLog: { status: string; at: Date }[];
  enrollments: EnrollmentFact[];
}
export interface CourseFact {
  id: string;
  name: string;
  monthly: boolean;
  priceNow: number;
  priceHistory: Point<number>[];
}
export interface CenterFacts {
  rooms: RoomFact[];
  groups: GroupFact[];
  courses: Map<string, CourseFact>;
}

export interface OverviewBranch {
  id: number;
  name: string;
  rooms: number;
}
export interface RoomRow {
  id: string;
  name: string;
  branchId: number;
  branchName: string;
  capacity: number | null;
  groupCount: number;
  lessonHours: number;
  occupancyPct: number | null;
}
export interface GroupRow {
  id: string;
  name: string;
  courseName: string;
  branchId: number;
  days: WeekDay[];
  start: string | null;
  end: string | null;
  enrolled: number;
  capacity: number;
  free: number;
  overfull: boolean;
}
export interface CenterOverview {
  month: string;
  /** ISO instant the figures are read at. */
  asOf: string;
  current: boolean;
  /** Branches that have a room at `asOf`, by name. */
  branches: OverviewBranch[];
  cards: {
    occupancyPct: number | null;
    lessonHoursPerWeek: number;
    /** null when the branches work in different windows. */
    workWindow: { start: string; end: string } | null;
    seats: { pct: number | null; enrolled: number; capacity: number };
    free: { seats: number; revenue: number };
  };
  /** Drawn for the picked branch (the only thing `filial` changes) or the first one; the rest of the answer covers the whole scope. */
  heat: { branchId: number; heat: Heat; insight: HeatInsight } | null;
  rooms: RoomRow[];
  /** Only groups with free seats, most free first. */
  groups: GroupRow[];
  months: { month: string; pct: number | null }[];
  notes: { deletedLater: number; unplaced: number };
}
