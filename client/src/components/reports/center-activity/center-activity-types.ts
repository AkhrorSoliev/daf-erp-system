/** Mirror of the server's `CenterOverview` answer (server/src/reports/center-activity/); field names are identical. */

export type WeekDay = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday";

export type HeatTone = "green" | "light" | "yellow" | "red";
export interface HeatCell {
  free: number;
  tone: HeatTone;
  /**
   * The rooms that hold a lesson in this whole hour: `room` indexes
   * `Heat.roomList`, `groups` are the deduped names of the groups holding it.
   * The free rooms are the indices NOT listed here (`free` = roomList.length − busy.length).
   */
  busy: { room: number; groups: string[] }[];
}
export interface Heat {
  rooms: number;
  /** The branch's rooms, in the order the cells' `busy[].room` index them. */
  roomList: { id: string; name: string; capacity: number | null }[];
  days: WeekDay[];
  hours: number[];
  /** [dayIndex][hourIndex] */
  cells: HeatCell[][];
}

export interface InsightSlot {
  days: WeekDay[];
  fromHour: number;
  /** Exclusive: 17 means up to 17:00. */
  toHour: number;
  freeMin: number;
  freeMax: number;
}
export interface HeatInsight {
  quiet: InsightSlot[];
  busy: InsightSlot | null;
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
